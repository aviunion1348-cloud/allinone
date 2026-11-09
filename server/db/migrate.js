/** Forward-only SQL migration runner with applied-version ledger. */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, run, exec } from "./connection.js";
import { log as logger } from "../util/logger.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export function migrate() {
  const db = getDb();
  exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
  );`);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version),
  );
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    logger.info("migration.applying", { file });
    db.exec("BEGIN");
    try {
      db.exec(sql);
      run("INSERT INTO schema_migrations (version) VALUES (?)", file);
      db.exec("COMMIT");
      count += 1;
    } catch (err) {
      db.exec("ROLLBACK");
      logger.error("migration.failed", { file, error: err.message });
      throw err;
    }
  }
  if (count) logger.info("migration.applied", { count });
  return count;
}

// CLI entry: node server/db/migrate.js
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate();
  console.log("migrations up to date");
}

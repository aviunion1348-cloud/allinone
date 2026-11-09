/**
 * Data access foundation.
 *
 * - Single WAL-mode SQLite database (node:sqlite, zero native deps)
 * - Foreign keys enforced on every connection
 * - Positional parameter helper that sanitises JS types SQLite rejects
 *   (booleans, undefined) so repositories stay type-safe.
 */
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { log } from "../util/logger.js";

let db = null;

export function getDb() {
  if (db) return db;
  db = new DatabaseSync(config.dbFile);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA temp_store = MEMORY;");
  log.info("database.opened", { file: config.dbFile });
  return db;
}

/** Coerce a JS value into a bindable SQLite parameter. */
export function bind(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

/** Normalise a parameter object/array into what node:sqlite accepts. */
export function bindAll(params) {
  if (Array.isArray(params)) return params.map(bind);
  if (params && typeof params === "object") {
    const out = {};
    for (const [k, v] of Object.entries(params)) out[k] = bind(v);
    return out;
  }
  return params === undefined ? [] : [bind(params)];
}

/** SELECT helper — returns all rows. */
export function all(sql, ...params) {
  return getDb().prepare(sql).all(...bindAll(params.flat()));
}

/** SELECT helper — returns first row or undefined. */
export function get(sql, ...params) {
  return getDb().prepare(sql).get(...bindAll(params.flat()));
}

/** INSERT/UPDATE/DELETE helper — returns { changes, lastInsertRowid }. */
export function run(sql, ...params) {
  const result = getDb().prepare(sql).run(...bindAll(params.flat()));
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  };
}

/** Multi-statement DDL helper. */
export function exec(sql) {
  getDb().exec(sql);
}

/**
 * Run `fn` inside an IMMEDIATE transaction; rolls back on any throw.
 * Nested calls reuse the outer transaction (savepoint-free, single level).
 */
let txDepth = 0;
export function tx(fn) {
  const database = getDb();
  if (txDepth > 0) return fn();
  txDepth += 1;
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* connection already rolled back */
    }
    throw err;
  } finally {
    txDepth -= 1;
  }
}

export function closeDb() {
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = null;
  }
}

/** Health probe for /healthz. */
export function pingDb() {
  try {
    get("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}

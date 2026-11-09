/** Process entry — migrate, seed, listen, graceful shutdown. */
import { createApp } from "./app.js";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { seedIfEmpty } from "./db/seed.js";
import { closeDb, pingDb } from "./db/connection.js";
import { log } from "./util/logger.js";

// Backstop: a stray rejection must never kill the process — a dead server
// drops every session at once. Route-level async handlers are wrapped with
// asyncRoute; this only catches anything missed elsewhere.
process.on("unhandledRejection", (err) => {
  log.error("process.unhandled_rejection", {
    error: err?.message,
    stack: err?.stack,
  });
});

async function main() {
  migrate();
  if (config.seedOnEmpty) seedIfEmpty();

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    log.info("server.listening", {
      url: `http://${config.host}:${config.port}`,
      env: config.env,
    });
  });

  const shutdown = (signal) => {
    log.info("server.shutdown", { signal });
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // periodic health assertion — surfaces DB corruption early in logs
  setInterval(() => {
    if (!pingDb()) log.error("health.db_failed");
  }, 60_000).unref();
}

main().catch((err) => {
  log.error("server.boot_failed", { error: err.message, stack: err.stack });
  process.exit(1);
});

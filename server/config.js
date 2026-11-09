/**
 * Typed runtime configuration. Everything is env-overridable; secrets are
 * generated once at first boot and persisted under data/ so restarts don't
 * invalidate sessions.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
mkdirSync(dataDir, { recursive: true });

function secret(name, bytes = 48) {
  if (process.env[name]) return process.env[name];
  const file = path.join(dataDir, `.${name}`);
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const value = randomBytes(bytes).toString("hex");
  writeFileSync(file, value, { mode: 0o600 });
  return value;
}

const env = process.env.NODE_ENV ?? "development";

export const config = Object.freeze({
  env,
  isProd: env === "production",
  host: process.env.HOST || "0.0.0.0",
  port: Number(process.env.PORT || 4100),
  root,
  dataDir,
  dbFile: process.env.DB_FILE || path.join(dataDir, "aurum.sqlite"),
  jwtSecret: secret("AURUM_JWT_SECRET"),
  jwtTtl: process.env.JWT_TTL || "12h",
  cookieName: "aurum_session",
  cookieSecure: process.env.COOKIE_SECURE === "1",
  seedOnEmpty: process.env.SEED_ON_EMPTY !== "0",
  logLevel: process.env.LOG_LEVEL || (env === "test" ? "error" : "info"),
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "1",
  excalidrawUrl:
    process.env.EXCALIDRAW_URL ||
    "https://excalidraw.com/#json=_z6CsPYBItOKkslJ_wN30,tWCP-uOrZB1_YFF7Qr03Wg",
});

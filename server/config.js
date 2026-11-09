/**
 * Typed runtime configuration. Everything is env-overridable; secrets are
 * generated once at first boot and persisted under data/ so restarts don't
 * invalidate sessions.
 *
 * On Vercel the bundle root is read-only, so all mutable state (SQLite
 * file, generated JWT secret) is redirected to /tmp — writable there, but
 * per-instance: set AURUM_JWT_SECRET as an env var so sessions survive
 * cold starts.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const onVercel = Boolean(process.env.VERCEL);
const dataDir = onVercel
  ? path.join(os.tmpdir(), "aurum-data") // bundle root is read-only on serverless
  : path.join(root, "data");
mkdirSync(dataDir, { recursive: true });

function secret(name, bytes = 48) {
  if (process.env[name]) return process.env[name];
  const file = path.join(dataDir, `.${name}`);
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const value = randomBytes(bytes).toString("hex");
  writeFileSync(file, value, { mode: 0o600 });
  return value;
}

/**
 * JWT signing secret.
 *
 * Locally we generate once and persist under data/ (stable across restarts).
 * On serverless the bundle + /tmp are per-instance, so a *random* secret
 * would be different on every cold start (and every concurrent instance) —
 * invalidating all sessions at random ("Session expired" everywhere).
 * There we fall back to a stable deployment-wide value unless the operator
 * sets AURUM_JWT_SECRET (recommended for anything non-demo).
 */
function jwtSecretValue() {
  if (process.env.AURUM_JWT_SECRET) return process.env.AURUM_JWT_SECRET;
  if (onVercel) return "aurum-ops-vercel-default-secret-set-AURUM_JWT_SECRET-to-override";
  return secret("AURUM_JWT_SECRET");
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
  jwtSecret: jwtSecretValue(),
  jwtTtl: process.env.JWT_TTL || "7d",
  cookieName: "aurum_session",
  cookieSecure: process.env.COOKIE_SECURE === "1" || onVercel,
  seedOnEmpty: process.env.SEED_ON_EMPTY !== "0",
  logLevel: process.env.LOG_LEVEL || (env === "test" ? "error" : "info"),
  corsOrigins: (process.env.CORS_ORIGINS || "").split(",").filter(Boolean),
  // Vercel sits behind a proxy — trusting it is required for correct
  // client IPs and to keep express-rate-limit's header validation happy.
  trustProxy: process.env.TRUST_PROXY === "1" || onVercel,
  excalidrawUrl:
    process.env.EXCALIDRAW_URL ||
    "https://excalidraw.com/#json=_z6CsPYBItOKkslJ_wN30,tWCP-uOrZB1_YFF7Qr03Wg",
});

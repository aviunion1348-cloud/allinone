/** Structured JSON logger with level filtering (no deps). */
import { config } from "../config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function write(level, msg, fields) {
  if (LEVELS[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields || {}),
  };
  const out = JSON.stringify(line);
  if (level === "error") process.stderr.write(out + "\n");
  else process.stdout.write(out + "\n");
}

export const log = {
  debug: (msg, fields) => write("debug", msg, fields),
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
  child(bound) {
    return {
      debug: (m, f) => write("debug", m, { ...bound, ...f }),
      info: (m, f) => write("info", m, { ...bound, ...f }),
      warn: (m, f) => write("warn", m, { ...bound, ...f }),
      error: (m, f) => write("error", m, { ...bound, ...f }),
    };
  },
};

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message, details) {
    return new HttpError(400, "bad_request", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new HttpError(401, "unauthorized", message);
  }
  static forbidden(message = "Not allowed") {
    return new HttpError(403, "forbidden", message);
  }
  static notFound(what = "Resource") {
    return new HttpError(404, "not_found", `${what} not found`);
  }
  static conflict(message, details) {
    return new HttpError(409, "conflict", message, details);
  }
}

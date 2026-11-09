/** HTTP middleware: auth (JWT cookie), validation (zod), errors, request log. */
import jwt from "jsonwebtoken";
import { ZodError } from "zod";
import { config } from "../config.js";
import { HttpError, log } from "../util/logger.js";
import { authService } from "../services/index.js";

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtTtl },
  );
}

export function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: 12 * 3600 * 1000,
    path: "/",
  });
}

export function requireAuth(req, _res, next) {
  const token =
    req.cookies?.[config.cookieName] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return next(HttpError.unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = authService.me(payload.sub);
    if (!user.active) return next(HttpError.forbidden("Account disabled"));
    req.user = user;
    authService.touch(user.id);
    next();
  } catch {
    next(HttpError.unauthorized("Session expired"));
  }
}

/** requireRole('admin','lead') — 403 otherwise. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(HttpError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(HttpError.forbidden(`Requires role: ${roles.join(" | ")}`));
    }
    next();
  };
}

/** Wrap a zod schema: req[safeKey] receives the parsed value. */
export function validate(schema, key = "body") {
  return (req, _res, next) => {
    try {
      req[key === "body" ? "validated" : `validated_${key}`] = schema.parse(req[key]);
      next();
    } catch (err) {
      next(err instanceof ZodError ? err : err);
    }
  };
}

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    log.info("http", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Math.round(ms * 10) / 10,
      user: req.user?.id,
    });
  });
  next();
}

export function notFound(_req, _res, next) {
  next(HttpError.notFound("Endpoint"));
}

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "validation_error",
        message: "Validation failed",
        details: err.issues.map((e) => ({ path: e.path.join("."), message: e.message })),
      },
    });
  }
  if (err instanceof HttpError || err.status) {
    if (err.status >= 500) {
      log.error("http.error", { path: req.originalUrl, error: err.message, stack: err.stack });
    }
    return res.status(err.status).json({
      error: { code: err.code || "error", message: err.message, details: err.details },
    });
  }
  // SQLite constraint errors → clean 409s
  if (err?.code?.startsWith?.("SQLITE_CONSTRAINT")) {
    return res.status(409).json({
      error: { code: "conflict", message: "Constraint violation", details: err.message },
    });
  }
  log.error("http.unhandled", { path: req.originalUrl, error: err.message, stack: err.stack });
  res.status(500).json({ error: { code: "internal", message: "Internal server error" } });
}

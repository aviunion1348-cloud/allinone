/** Express application factory — middleware chain, API mount, SPA static. */
import path from "node:path";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config } from "./config.js";
import { api } from "./routes/index.js";
import { requestLogger, notFound, errorHandler } from "./middleware/index.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          "default-src": ["'self'"],
          "base-uri": ["'self'"],
          "object-src": ["'none'"],
          "form-action": ["'self'"],
          "script-src": ["'self'"],
          "script-src-attr": ["'none'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "https:"],
          "connect-src": ["'self'"],
          // allow the live-preview host to frame the app (clickjacking is a
          // non-issue for this authenticated internal tool)
          "frame-src": ["https://excalidraw.com", "https://*.excalidraw.com"],
          "frame-ancestors": ["*"],
        },
      },
      // X-Frame-Options would override frame-ancestors for embedding
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      // CORP must be cross-origin or the preview proxy can't load documents
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Optional CORS for approved external tooling (empty by default → same-origin only)
  if (config.corsOrigins.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
          return res.sendStatus(204);
        }
      } else if (req.method === "OPTIONS") {
        return res.sendStatus(403);
      }
      return next();
    });
  }

  // Baseline API limiter (auth has its own tighter bucket).
  app.use(
    "/api/",
    rateLimit({
      windowMs: 60_000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: "rate_limited", message: "Slow down" } },
    }),
  );

  app.use("/api/v1", api);
  app.use("/api", notFound);

  // SPA — hash router, so any path falls back to index.html.
  const publicDir = path.join(config.root, "public");
  app.use(express.static(publicDir, { index: "index.html", maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

/**
 * Vercel serverless entry — exports the Express app as the function
 * handler (API + static SPA). Schema bootstrap runs once per cold
 * start and is fully idempotent (migrate + seed-if-empty).
 */
import { migrate } from "../server/db/migrate.js";
import { seedIfEmpty } from "../server/db/seed.js";
import { createApp } from "../server/app.js";

migrate();
seedIfEmpty();

export default createApp();

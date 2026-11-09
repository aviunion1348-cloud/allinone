/**
 * Idempotent bootstrap seed — only runs when the users table is empty.
 *
 * Seeds ONLY company reference data — nothing invented:
 *   • the real team roster (roles from the delivery playbook)
 *   • SLA policies transcribed from the Excalidraw pipeline document
 *
 * Clients, projects and tasks are intentionally left EMPTY: real
 * engagements are created through the app with actual client data.
 * (Older databases are cleaned once by migration 002_purge_demo_data.)
 */
import bcrypt from "bcryptjs";
import { get, run, all } from "./connection.js";
import { ensureSlaPolicies } from "../domain/sla.js";
import { recomputeRanks } from "../domain/ai.js";
import { log } from "../util/logger.js";

const USERS = [
  { email: "avi@aurum.internal", name: "Avi", role: "admin", title: "QA", color: "#e8b923", capacity: 40 },
  { email: "hoE@aurum.internal", name: "HoE", role: "lead", title: "Head of Engineering", color: "#f5d76e", capacity: 36 },
  { email: "cto@aurum.internal", name: "CTO", role: "lead", title: "Chief Technology Officer", color: "#c9a227", capacity: 32 },
  { email: "agrim@aurum.internal", name: "Agrim", role: "qa", title: "QA / Development", color: "#ffd866", capacity: 36 },
  { email: "aryan@aurum.internal", name: "Aryan", role: "dev", title: "Development", color: "#e0b64f", capacity: 40 },
  { email: "divisha@aurum.internal", name: "Divisha", role: "dev", title: "Data / scraping", color: "#d9a441", capacity: 36 },
  { email: "vaibhav@aurum.internal", name: "Vaibhav", role: "dev", title: "ML training", color: "#cbb26a", capacity: 40 },
  { email: "anant@aurum.internal", name: "Anant", role: "dev", title: "Backend / DB", color: "#b9974a", capacity: 36 },
  { email: "patty@aurum.internal", name: "Patty", role: "dev", title: "Schema design", color: "#a8894e", capacity: 32 },
  { email: "akshat@aurum.internal", name: "Akshat", role: "dev", title: "Frontend", color: "#967c44", capacity: 32 },
];

export function seedIfEmpty() {
  ensureSlaPolicies();
  const existing = get("SELECT COUNT(*) AS n FROM users");
  if (existing && existing.n > 0) {
    log.info("seed.skipped", { reason: "not_empty" });
    return;
  }

  log.info("seed.start");
  const hash = bcrypt.hashSync(process.env.AURUM_SEED_PASSWORD || "aurum-2026", 10);
  for (const u of USERS) {
    run(
      `INSERT INTO users (email, name, password_hash, role, title, color, capacity_hours_week)
       VALUES (?,?,?,?,?,?,?)`,
      u.email.toLowerCase(), u.name, hash, u.role, u.title, u.color, u.capacity,
    );
  }

  recomputeRanks({ persist: true });

  const counts = {
    users: all("SELECT COUNT(*) AS n FROM users")[0].n,
    clients: all("SELECT COUNT(*) AS n FROM clients")[0].n,
    projects: all("SELECT COUNT(*) AS n FROM projects")[0].n,
    tasks: all("SELECT COUNT(*) AS n FROM tasks")[0].n,
  };
  log.info("seed.complete", counts);
}

/** Idempotent demo seed — only runs when the users table is empty. */
import bcrypt from "bcryptjs";
import { get, run, all } from "./connection.js";
import { ensureSlaPolicies } from "../domain/sla.js";
import { recomputeRanks } from "../domain/ai.js";
import { log } from "../util/logger.js";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const now = Date.now();

const USERS = [
  { email: "avi@aurum.internal", name: "Avi", role: "admin", title: "Founder / QA lead", color: "#e8b923", capacity: 40 },
  { email: "hoE@aurum.internal", name: "HoE", role: "lead", title: "Head of Engineering", color: "#f5d76e", capacity: 36 },
  { email: "cto@aurum.internal", name: "CTO", role: "lead", title: "Chief Technology Officer", color: "#c9a227", capacity: 32 },
  { email: "agrim@aurum.internal", name: "Agrim", role: "qa", title: "QA / Development", color: "#ffd866", capacity: 36 },
  { email: "aryan@aurum.internal", name: "Aryan", role: "dev", title: "Development", color: "#e0b64f", capacity: 40 },
  { email: "divisha@aurum.internal", name: "Divisha", role: "dev", title: "Data / scraping", color: "#d9a441", capacity: 36 },
  { email: "vaibhav@aurum.internal", name: "Vaibhav", role: "dev", title: "ML training", color: "#cbb26a", capacity: 40 },
  { email: "anant@aurum.internal", name: "Anant", role: "dev", title: "Backend / DB", color: "#b9974a", capacity: 36 },
  { email: "patty@aurum.internal", name: "Patty", role: "dev", title: "Schema design", color: "#a8894e", capacity: 32 },
  { email: "akshat@aurum.internal", name: "Akshat", role: "dev", title: "Frontend", color: "#967c44", capacity: 32 },
  { email: "viewer@aurum.internal", name: "Client Viewer", role: "viewer", title: "Read-only stakeholder", color: "#8a8a93", capacity: 8 },
];

const CLIENTS = [
  {
    name: "Rohan Mehta", company: "Lear", contact_name: "Rohan Mehta", email: "rohan@lear.example",
    persona: "dreamer", region: "india", stage: "development", status: "active", deal_band: "xl",
    owner: 1, notes: "Jarvis-like supercomputer pitch landed. Weekly status meetings with PM. Partner console + IAM dashboards.",
  },
  {
    name: "Sanya Kapoor", company: "BitHub Jaipur", contact_name: "Sanya Kapoor", email: "sanya@bithub.example",
    persona: "enthusiast", region: "india", stage: "qa", status: "active", deal_band: "l",
    owner: 2, notes: "Classroom booking DB on Aiven SQLite, AWS backend, GitHub Pages frontend. Wants demo before kickoff.",
  },
  {
    name: "Marcus Weber", company: "Nordwind Logistics", contact_name: "Marcus Weber", email: "m.weber@nordwind.example",
    persona: "pessimistic", region: "emea", stage: "technical_consultation", status: "lead", deal_band: "m",
    owner: 3, notes: "Skeptical of AI code in codebase. Positioning: diagnosis agent that saves RCA hours. Afternoon EMEA slot.",
  },
  {
    name: "Dana Whitfield", company: "Helios Retail Group", contact_name: "Dana Whitfield", email: "dana@helios.example",
    persona: "enthusiast", region: "americas", stage: "planning", status: "active", deal_band: "l",
    owner: 1, notes: "Night IST / Americas slot. Plan approved pending edge-case matrix. Ship target tight.",
  },
  {
    name: "Priya Nair", company: "Orbit Fintech", contact_name: "Priya Nair", email: "priya@orbit.example",
    persona: "dreamer", region: "india", stage: "initial_consultation", status: "lead", deal_band: "m",
    owner: 2, notes: "Full automation dream pitch. Needs onboarding artifact deck.",
  },
  {
    name: "Tomas Alvarez", company: "Cedar Health", contact_name: "Tomas Alvarez", email: "tomas@cedar.example",
    persona: "pessimistic", region: "americas", stage: "outreach", status: "lead", deal_band: "s",
    owner: 3, notes: "Email-bot positioning — opinion on outages, no agent hype.",
  },
  {
    name: "Yuki Tanaka", company: "Sakura Payments", contact_name: "Yuki Tanaka", email: "yuki@sakura.example",
    persona: "enthusiast", region: "emea", stage: "won", status: "active", deal_band: "xl",
    owner: 1, notes: "Closed won — in maintenance: OTA updates, uptime monitoring, API usage tracking.",
  },
];

const PHASE_DEFS = [
  { key: "spec", name: "Spec & architecture", hours: 72 },
  { key: "build", name: "Development modules", hours: 168 },
  { key: "qa", name: "QA & test reports", hours: 12 },
  { key: "demo", name: "Demo & approval", hours: 336 },
  { key: "ship", name: "Ship & deploy", hours: 120 },
  { key: "handover", name: "Handover & maintenance", hours: 720 },
];

export function seedIfEmpty() {
  ensureSlaPolicies();
  const existing = get("SELECT COUNT(*) AS n FROM users");
  if (existing && existing.n > 0) {
    log.info("seed.skipped", { reason: "not_empty" });
    return;
  }

  log.info("seed.start");
  const hash = bcrypt.hashSync("aurum-2026", 10);

  const userIds = {};
  for (const u of USERS) {
    const { lastInsertRowid } = run(
      `INSERT INTO users (email, name, password_hash, role, title, color, capacity_hours_week)
       VALUES (?,?,?,?,?,?,?)`,
      u.email.toLowerCase(), u.name, hash, u.role, u.title, u.color, u.capacity,
    );
    userIds[u.name] = lastInsertRowid;
  }

  const clientIds = {};
  for (const c of CLIENTS) {
    const { lastInsertRowid } = run(
      `INSERT INTO clients (name, company, contact_name, email, persona, region, stage, status, deal_band, notes, owner_id, stage_entered_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      c.name, c.company, c.contact_name, c.email, c.persona, c.region, c.stage, c.status,
      c.deal_band, c.notes, c.owner, now - Math.floor(Math.random() * 10) * DAY,
    );
    clientIds[c.company] = lastInsertRowid;
  }

  const PROJECTS = [
    {
      code: "LEAR-01", name: "Lear partner console & IAM", client: "Lear", lead: "HoE",
      status: "active", priority: "critical", budget: 320,
      desc: "Unique page per partner, IAM user management, dashboards, unique code per device, pricing by device limit. Edge cases ≥ 3500 before ship.",
      start: now - 9 * DAY, target: now + 11 * DAY,
      phaseOffsets: { spec: "done", build: "active", qa: "pending", demo: "pending", ship: "pending", handover: "pending" },
    },
    {
      code: "BITHUB-J", name: "BitHub Jaipur classroom booking", client: "BitHub Jaipur", lead: "CTO",
      status: "active", priority: "high", budget: 180,
      desc: "Aiven SQLite schema, AWS backend queries for free classroom/faculty, GitHub Pages frontend. Merge via PR into upstream.",
      start: now - 5 * DAY, target: now + 9 * DAY,
      phaseOffsets: { spec: "done", build: "active", qa: "active", demo: "pending", ship: "pending", handover: "pending" },
    },
    {
      code: "HEL-02", name: "Helios edge-case matrix & ship", client: "Helios Retail Group", lead: "Avi",
      status: "active", priority: "critical", budget: 140,
      desc: "Plan approved w/o major changes — kickoff week started. Exec summary min 2 days before proposed ship date.",
      start: now - 2 * DAY, target: now + 12 * DAY,
      phaseOffsets: { spec: "active", build: "pending", qa: "pending", demo: "pending", ship: "pending", handover: "pending" },
    },
    {
      code: "NORD-01", name: "Nordwind diagnosis agent PoC", client: "Nordwind Logistics", lead: "CTO",
      status: "planning", priority: "medium", budget: 96,
      desc: "Technical consultation follow-up. Ask for demo/mock of infra, host our own based on understanding. First consultation → plan ≤ 3 days.",
      start: now - 1 * DAY, target: now + 20 * DAY,
      phaseOffsets: { spec: "active", build: "pending", qa: "pending", demo: "pending", ship: "pending", handover: "pending" },
    },
    {
      code: "SAK-07", name: "Sakura OTA & uptime monitoring", client: "Sakura Payments", lead: "HoE",
      status: "active", priority: "high", budget: 240,
      desc: "Post-ship maintenance: OTA updates, uptime monitoring, client usage & API usage tracking.",
      start: now - 30 * DAY, target: now + 30 * DAY,
      phaseOffsets: { spec: "done", build: "done", qa: "done", demo: "done", ship: "done", handover: "active" },
    },
  ];

  const projectIds = {};
  for (const p of PROJECTS) {
    const { lastInsertRowid } = run(
      `INSERT INTO projects (code, name, description, client_id, lead_id, status, priority, start_date, target_date, budget_hours)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      p.code, p.name, p.desc, clientIds[p.client], userIds[p.lead], p.status, p.priority,
      p.start, p.target, p.budget,
    );
    projectIds[p.code] = lastInsertRowid;

    let order = 1;
    for (const ph of PHASE_DEFS) {
      const state = p.phaseOffsets[ph.key];
      const startedAt = state === "pending" ? null : now - Math.floor((PHASE_DEFS.length - order + 1) * DAY);
      const dueAt = state === "pending" ? null : startedAt + ph.hours * HOUR;
      const completedAt = state === "done" ? dueAt - 2 * HOUR : null;
      run(
        `INSERT INTO phases (project_id, key, name, order_no, status, sla_hours, started_at, due_at, completed_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        lastInsertRowid, ph.key, ph.name, order, state, ph.hours, startedAt, dueAt, completedAt,
      );
      order += 1;
    }
  }

  /* tasks: [project, title, type, status, priority, assignee, estHrs, dueInHrs, labels, desc] */
  const TASKS = [
    ["LEAR-01", "Parse tip channels — $OLA, $AAPL, $TSLA coverage", "feature", "in_progress", "critical", "Divisha", 8, 6, ["data", "ingest"], "Make sure all tips for stocks in portfolio are parsed. Light-weight scraper for news & socials; X trending/hashtags; Reddit API (check free tier)."],
    ["LEAR-01", "Jev indicator inference (math models only)", "research", "in_progress", "critical", "Vaibhav", 16, 20, ["ml", "inference"], "Indicators via mathematical models — avoid LLMs with numbers. Final inference local, vanilla, lightweight."],
    ["LEAR-01", "News & socials light-weight scraper", "feature", "todo", "high", "Divisha", 12, 30, ["ingest"], "X trending, hashtags #AAPL, Reddit API — evaluate rate limits and cost."],
    ["LEAR-01", "Reasoning layer — Gemini / Deepseek / local Hermes", "research", "todo", "high", "Vaibhav", 10, 44, ["ml"], "Compare latency, accuracy, F1, compute power, compute cost across3.7 flash-lite, deepseek, OMP/Hermes qwen 9b."],
    ["LEAR-01", "Partner console — IAM user management UI", "feature", "in_review", "high", "Akshat", 12, 2, ["frontend", "iam"], "Console allows partners to manage IAM users and dashboards at lear.drufiy.com/partner."],
    ["LEAR-01", "Edge-case matrix (≥3500 cases) before ship", "qa", "todo", "critical", "Agrim", 20, 96, ["qa", "ship-gate"], "Minimum 3500 edge cases created before shipping and final deployment."],
    ["LEAR-01", "Executive summary — 2 days before ship date", "doc", "backlog", "high", "Avi", 4, 72, ["ship-gate"], "Executive summary on the shipping MINIMUM 2 days before proposed ship date."],
    ["LEAR-01", "Device-limit pricing config", "feature", "backlog", "medium", "Anant", 8, 120, ["billing"], "Unique code per N devices per partner; pricing based on device limit."],
    ["LEAR-01", "Weekly status meeting notes automation", "chore", "backlog", "low", "Avi", 2, 168, ["pm"], "Client wants weekly meetings with the PM — automate notes + action items."],

    ["BITHUB-J", "Aiven SQLite schema for classroom info", "feature", "in_progress", "critical", "Patty", 6, 4, ["db", "aiven"], "Create table schema for classroom info, add to git repo, add table to the Aiven dashboard."],
    ["BITHUB-J", "Backend queries — free classroom/faculty lookup", "feature", "todo", "high", "Anant", 8, 26, ["backend"], "MySQL connector or pymysql — query DB for free classroom, free faculty at a specific point in time."],
    ["BITHUB-J", "Frontend: booking buttons & UI wiring", "feature", "todo", "medium", "Akshat", 10, 50, ["frontend"], "Add options, buttons and UI in the frontend of BitHub Jaipur."],
    ["BITHUB-J", "Merge schema PR into upstream (#main)", "chore", "in_review", "high", "Anant", 2, 8, ["git"], "Raise a PR against ananttheacharya/BitHUb-Jaipur and merge into AWS instance."],
    ["BITHUB-J", "QA report — booking flow turnaround", "qa", "todo", "high", "Agrim", 3, 10, ["qa"], "Max turnover for any QA report = 12 hours. Bug report + testing report submitted on demand."],
    ["BITHUB-J", "GitHub Pages static hosting check", "chore", "done", "medium", "Akshat", 2, -48, ["git"], "Static computer — won't serve live data, only HTML/CSS. Verified hosting path."],
    ["BITHUB-J", "Branching & PR workflow doc for client", "doc", "backlog", "low", "Avi", 2, 140, ["docs"], "Pull, push, commit, branching, forking, merging — write-up for the client's team."],

    ["HEL-02", "Edge-case matrix draft", "qa", "in_progress", "critical", "Agrim", 12, 18, ["qa", "ship-gate"], "Ship gate for Helios — matrix must be complete before exec summary."],
    ["HEL-02", "Onboarding artifact (deck/pdf) via agent", "doc", "todo", "high", "Avi", 6, 36, ["onboarding"], "Unique artifact per client — regulations, compliances, friction overview, product how-it-works."],
    ["HEL-02", "Demo environment — mock service hosted by us", "feature", "todo", "high", "Aryan", 10, 54, ["demo"], "Ask client for demo/mock of their service, or create our own based on understanding, hosted by us. #Lead or PM"],
    ["HEL-02", "Module: checkout telemetry (1-day turnover)", "feature", "in_progress", "high", "Aryan", 6, 5, ["module"], "Max turnover per module = 1 day. Subject to proper testing."],
    ["HEL-02", "WhatsApp group production channel", "chore", "backlog", "medium", "Avi", 1, 100, ["comms"], "Set up production WhatsApp group for client comms."],
    ["HEL-02", "Demo approval checkpoint", "feature", "backlog", "critical", "HoE", 2, 168, ["demo", "milestone"], "Max time to first demo = 2 weeks; ship after demo approval ≤ 5 days."],

    ["NORD-01", "Technical consultation — CTO codebase overview", "research", "in_progress", "critical", "CTO", 4, 12, ["consult"], "With the CTO: liaison, connection, brief overview of the codebase. Initial meeting outcome → decide if eng team meeting needed."],
    ["NORD-01", "Product spec draft (consultation → plan ≤ 3 days)", "doc", "todo", "critical", "HoE", 6, 40, ["spec"], "Delta between first consultation and plan discussion = max 3 days."],
    ["NORD-01", "Request infra demo / mock from client", "feature", "backlog", "medium", "Aryan", 3, 70, ["demo"], "Ask them for a demo or mock of their service/infra."],
    ["NORD-01", "Positioning one-pager — diagnosis agent (RCA)", "doc", "backlog", "medium", "Avi", 2, 90, ["outreach"], "Pessimistic persona: diagnosis agent that saves engineering hours in RCA and slog work."],

    ["SAK-07", "OTA update pipeline monitoring", "feature", "in_progress", "high", "Anant", 10, 30, ["ota", "maint"], "OTA updates + maintenance, uptime monitoring for shipped client."],
    ["SAK-07", "API usage dashboards per client", "feature", "todo", "medium", "Akshat", 8, 80, ["dashboard"], "Track client usage, API usage and other details regarding each client."],
    ["SAK-07", "Passive feedback loop around product", "chore", "backlog", "low", "Avi", 3, 200, ["feedback"], "#passive — continuous passive feedback around the product."],
    ["SAK-07", "12h QA regression sweep", "qa", "in_review", "high", "Agrim", 4, 6, ["qa"], "Max turnover for any Q/A report = 12 hours."],
    ["SAK-07", "Active: legal, MoUs, contracts per client", "doc", "backlog", "medium", "Avi", 5, 240, ["legal"], "#active — deal with legal, MoUs and contracts with each client."],
  ];

  const phaseIdFor = (projectId, key) =>
    get("SELECT id FROM phases WHERE project_id = ? AND key = ?", projectId, key)?.id;

  const statusToPhase = {
    in_progress: "build", in_review: "qa", todo: "build",
    backlog: "spec", blocked: "build", done: "ship",
  };

  for (const [code, title, type, status, priority, assignee, est, dueInHrs, labels, desc] of TASKS) {
    const projectId = projectIds[code];
    const phaseKey = statusToPhase[status] ?? "build";
    const dueAt = now + dueInHrs * HOUR;
    const created = now - Math.floor(Math.random() * 6) * DAY - HOUR;
    const { lastInsertRowid } = run(
      `INSERT INTO tasks (project_id, phase_id, assignee_id, reporter_id, title, description, type,
                          status, priority, estimate_hours, due_at, labels, position, created_at, started_at, completed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      projectId,
      phaseIdFor(projectId, phaseKey),
      userIds[assignee] ?? null,
      userIds.Avi,
      title, desc, type, status, priority, est, dueAt,
      JSON.stringify(labels),
      Math.random() * 100,
      created,
      ["in_progress", "in_review", "done"].includes(status) ? created + HOUR : null,
      status === "done" ? now - DAY : null,
    );

    if (status === "done") {
      run("UPDATE tasks SET rank_score = 0 WHERE id = ?", lastInsertRowid);
    }
  }

  // A couple of real dependencies (blocker chains)
  const edge = get("SELECT id FROM tasks WHERE title LIKE 'Edge-case matrix (≥3500%'");
  const execSum = get("SELECT id FROM tasks WHERE title LIKE 'Executive summary%'");
  if (edge && execSum) {
    run("INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?,?)", execSum.id, edge.id);
  }
  const schema = get("SELECT id FROM tasks WHERE title LIKE 'Aiven SQLite schema%'");
  const queries = get("SELECT id FROM tasks WHERE title LIKE 'Backend queries%'");
  if (schema && queries) {
    run("INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?,?)", queries.id, schema.id);
  }

  // Seed activity trail
  const ACTS = [
    [userIds.Avi, "client", clientIds.Lear, "stage", "advanced Lear: kickoff → development"],
    [userIds.HoE, "project", projectIds["LEAR-01"], "created", "created project LEAR-01 — Lear partner console & IAM"],
    [userIds.CTO, "project", projectIds["BITHUB-J"], "created", "created project BITHUB-J — BitHub Jaipur classroom booking"],
    [userIds.Agrim, "task", 1, "moved", "moved “QA report” todo → in_progress"],
    [userIds.Avi, "client", clientIds["Helios Retail Group"], "stage", "advanced Helios Retail Group: technical_consultation → planning"],
    [userIds.HoE, "phase", 1, "advance", "phase “Spec & architecture” → done"],
  ];
  for (const [actor, entity, entityId, action, summary] of ACTS) {
    run(
      `INSERT INTO activities (actor_id, entity, entity_id, action, summary, created_at)
       VALUES (?,?,?,?,?,?)`,
      actor, entity, entityId, action, summary, now - Math.floor(Math.random() * 48) * HOUR,
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

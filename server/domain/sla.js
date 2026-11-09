/**
 * Domain: turnover SLA policies (transcribed from the Excalidraw pipeline
 * document) + breach computation used by the dashboard and board badges.
 */
import { all, get } from "../db/connection.js";

/** Canonical policy definitions — seeded on first boot. */
export const SLA_POLICIES = [
  {
    key: "plan_delta",
    name: "Consultation → Plan",
    scope: "pipeline",
    hours: 72,
    unit: "hours",
    hard: 1,
    description:
      "Delta between first consultation and plan discussion = max 3 days (subject to client availability / need for another meeting).",
  },
  {
    key: "plan_response",
    name: "Plan change response",
    scope: "pipeline",
    hours: 32,
    unit: "hours",
    hard: 1,
    description:
      "If plan approved w/o major changes kickoff week starts; otherwise get back to the client within a maximum of 12–32 hours.",
  },
  {
    key: "module_dev",
    name: "Module turnover (dev)",
    scope: "task",
    hours: 24,
    unit: "hours",
    hard: 1,
    description: "Max turnover per module = 1 day; each module finished within the same day (subject to proper testing).",
  },
  {
    key: "milestone",
    name: "Milestone turnover",
    scope: "project",
    hours: 168,
    unit: "hours",
    hard: 1,
    description: "Max turnover per milestone = 1 week.",
  },
  {
    key: "client_cycle",
    name: "Client delivery cycle",
    scope: "project",
    hours: 336,
    unit: "hours",
    hard: 1,
    description: "Maximum client turnover = 2 weeks, minimum should be 1 week (subject to proper testing).",
  },
  {
    key: "first_demo",
    name: "Time to first demo",
    scope: "project",
    hours: 336,
    unit: "hours",
    hard: 1,
    description: "Max time to first demo = 2 weeks.",
  },
  {
    key: "ship_after_demo",
    name: "Demo approval → ship",
    scope: "project",
    hours: 120,
    unit: "hours",
    hard: 1,
    description: "Max time to ship after demo approval = 5 days.",
  },
  {
    key: "qa_report",
    name: "QA report turnover",
    scope: "task",
    hours: 12,
    unit: "hours",
    hard: 1,
    description: "Max turnover for any Q/A report = 12 hours.",
  },
  {
    key: "exec_summary",
    name: "Exec summary lead time",
    scope: "quality",
    hours: 48,
    unit: "hours",
    hard: 1,
    description: "Executive summary on shipping submitted a MINIMUM of 2 days before the proposed ship date.",
  },
  {
    key: "edge_cases",
    name: "Edge cases before ship",
    scope: "quality",
    hours: null,
    value: 3500,
    unit: "count",
    hard: 1,
    description: "Edge cases created before shipping & final deployment = minimum 3500.",
  },
];

export function ensureSlaPolicies() {
  for (const p of SLA_POLICIES) {
    get(
      `INSERT INTO sla_policies (key, name, scope, hours, value, unit, hard, description)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(key) DO UPDATE SET name=excluded.name, scope=excluded.scope,
         hours=excluded.hours, value=excluded.value, unit=excluded.unit,
         hard=excluded.hard, description=excluded.description`,
      p.key,
      p.name,
      p.scope,
      p.hours ?? null,
      p.value ?? null,
      p.unit,
      p.hard,
      p.description,
    );
  }
}

export function listSlaPolicies() {
  return all("SELECT * FROM sla_policies ORDER BY scope, key");
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** ms remaining until `dueAt` (negative = overdue). */
export function remaining(dueAt, now = Date.now()) {
  if (!dueAt) return null;
  return dueAt - now;
}

/** Human + machine readable SLA state. */
export function slaState(dueAt, now = Date.now()) {
  const ms = remaining(dueAt, now);
  if (ms === null) return { state: "none", ms: null, label: "—" };
  const abs = Math.abs(ms);
  const label =
    abs < HOUR
      ? `${Math.max(1, Math.round(abs / 60_000))}m`
      : abs < DAY
        ? `${Math.round(abs / HOUR)}h`
        : `${(abs / DAY).toFixed(abs < 3 * DAY ? 1 : 0)}d`;
  if (ms < 0) return { state: "breached", ms, label: `${label} over` };
  if (ms < 4 * HOUR) return { state: "critical", ms, label: `${label} left` };
  if (ms < DAY) return { state: "warning", ms, label: `${label} left` };
  return { state: "ok", ms, label: `${label} left` };
}

/**
 * Aggregate turnover health across projects:
 * phases currently breaching / at risk, plus task-level breach counts.
 */
export function turnoverHealth(now = Date.now()) {
  const phases = all(
    `SELECT p.id, p.key, p.name, p.due_at, p.status, pr.name AS project_name, pr.code
       FROM phases p JOIN projects pr ON pr.id = p.project_id
      WHERE p.status = 'active' AND p.due_at IS NOT NULL`,
  ).map((p) => ({ ...p, sla: slaState(p.due_at, now) }));

  const tasksDue = all(
    `SELECT t.id, t.title, t.due_at, t.status, t.priority, pr.code AS project_code
       FROM tasks t JOIN projects pr ON pr.id = t.project_id
      WHERE t.status NOT IN ('done') AND t.due_at IS NOT NULL`,
  ).map((t) => ({ ...t, sla: slaState(t.due_at, now) }));

  const breachedPhases = phases.filter((p) => p.sla.state === "breached");
  const atRiskPhases = phases.filter((p) =>
    ["critical", "warning"].includes(p.sla.state),
  );
  const breachedTasks = tasksDue.filter((t) => t.sla.state === "breached");
  const dueToday = tasksDue.filter(
    (t) => t.sla.ms >= 0 && t.sla.ms < DAY,
  );

  // Turnover compliance: completed phases that finished before due_at / all completed
  const completed = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN completed_at IS NOT NULL AND due_at IS NOT NULL
                      AND completed_at <= due_at THEN 1 ELSE 0 END) AS on_time
       FROM phases WHERE status = 'done' AND due_at IS NOT NULL`,
  );
  const total = completed?.total ?? 0;
  const onTime = completed?.on_time ?? 0;

  return {
    phases,
    breachedPhases,
    atRiskPhases,
    breachedTasks,
    dueToday,
    compliance: {
      onTime,
      total,
      pct: total ? Math.round((onTime / total) * 100) : 100,
    },
  };
}

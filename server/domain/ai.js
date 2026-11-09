/**
 * Domain: explainable AI task-prioritisation engine.
 *
 * A weighted multi-factor model (WSJF-inspired + SLA pressure + dependency
 * leverage + load balance) produces a 0–100 rank_score with per-factor
 * contributions, so every recommendation on the board is auditable.
 *
 * The factor weights are persisted in `settings` under `ai.weights` and can
 * be tuned at runtime via PATCH /api/v1/ai/weights.
 */
import { all, get, run } from "../db/connection.js";

export const DEFAULT_WEIGHTS = {
  priority: 0.24,
  urgency: 0.22,
  slaRisk: 0.16,
  blocking: 0.12,
  effort: 0.08,
  projectPriority: 0.08,
  freshness: 0.05,
  load: 0.05,
};

const PRIORITY_BASE = { critical: 100, high: 75, medium: 50, low: 25 };
const PROJECT_PRIORITY = { critical: 100, high: 75, medium: 50, low: 25 };

export function getWeights() {
  const row = get("SELECT value FROM settings WHERE key = 'ai.weights'");
  if (!row) return { ...DEFAULT_WEIGHTS };
  try {
    return { ...DEFAULT_WEIGHTS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export function setWeights(next) {
  const merged = { ...DEFAULT_WEIGHTS, ...next };
  const sum = Object.values(merged).reduce((a, b) => a + b, 0) || 1;
  const normalized = Object.fromEntries(
    Object.entries(merged).map(([k, v]) => [k, Number((v / sum).toFixed(4))]),
  );
  run(
    `INSERT INTO settings (key, value) VALUES ('ai.weights', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000`,
    JSON.stringify(normalized),
  );
  return normalized;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/**
 * Score one task. `ctx` carries precomputed maps to keep board-wide scoring O(n).
 * Returns { score, factors: [{ key, label, raw, contribution }] }.
 */
export function scoreTask(task, ctx, weights = getWeights()) {
  const now = ctx.now;
  const factors = [];

  // 1. Intrinsic priority
  const priorityRaw = PRIORITY_BASE[task.priority] ?? 50;
  factors.push({ key: "priority", label: "Priority", raw: priorityRaw });

  // 2. Urgency: exponential decay on time-to-due (capped window of 7 days)
  let urgencyRaw = 40; // no due date → mild baseline
  if (task.due_at) {
    const msLeft = task.due_at - now;
    if (msLeft <= 0) urgencyRaw = 100;
    else if (msLeft < 4 * HOUR) urgencyRaw = 92;
    else if (msLeft < DAY) urgencyRaw = 80;
    else if (msLeft < 3 * DAY) urgencyRaw = 62;
    else if (msLeft < 7 * DAY) urgencyRaw = 44;
    else urgencyRaw = 28;
  }
  factors.push({ key: "urgency", label: "Due-date urgency", raw: urgencyRaw });

  // 3. SLA risk: breached / near-breach of the owning phase or task QA policy
  let slaRaw = 30;
  if (task.phase_due_at) {
    const ms = task.phase_due_at - now;
    if (ms < 0) slaRaw = 100;
    else if (ms < 6 * HOUR) slaRaw = 90;
    else if (ms < DAY) slaRaw = 75;
    else if (ms < 3 * DAY) slaRaw = 55;
    else slaRaw = 35;
  }
  if (task.type === "qa") slaRaw = Math.max(slaRaw, 70); // 12h QA report policy
  factors.push({ key: "slaRisk", label: "Turnover / SLA risk", raw: slaRaw });

  // 4. Blocking leverage: how many open tasks depend on this one
  const blockers = ctx.blockersOf.get(task.id) ?? [];
  const openBlockers = blockers.filter((b) => b.status !== "done").length;
  const blockingRaw = openBlockers === 0 ? 20 : Math.min(100, 40 + openBlockers * 20);
  factors.push({
    key: "blocking",
    label: openBlockers ? `Blocks ${openBlockers} task(s)` : "No dependents",
    raw: blockingRaw,
  });

  // 5. Effort — small next actions score higher (quick wins / WSJF ratio)
  const est = task.estimate_hours || 4;
  const effortRaw = est <= 1 ? 95 : est <= 4 ? 80 : est <= 8 ? 60 : est <= 16 ? 45 : 30;
  factors.push({ key: "effort", label: `Effort ≈ ${est}h`, raw: effortRaw });

  // 6. Owning project priority
  const projRaw = PROJECT_PRIORITY[task.project_priority] ?? 50;
  factors.push({ key: "projectPriority", label: "Project priority", raw: projRaw });

  // 7. Freshness — stale work-in-progress gently rises for attention
  const ageMs = now - (task.created_at || now);
  const freshRaw = task.status === "in_progress" && ageMs > 3 * DAY ? 70 : 40;
  factors.push({ key: "freshness", label: "Staleness", raw: freshRaw });

  // 8. Assignee load — overloaded assignees' tasks get a mild discount so the
  //    engine nudges work toward available capacity.
  let loadRaw = 50;
  if (task.assignee_id) {
    const open = ctx.openPerUser.get(task.assignee_id) ?? 0;
    const cap = ctx.capacity.get(task.assignee_id) ?? 32;
    const ratio = open / Math.max(4, cap / 8);
    loadRaw = ratio > 1.4 ? 20 : ratio > 1 ? 35 : 55;
  }
  factors.push({ key: "load", label: "Assignee load", raw: loadRaw });

  const withContribution = factors.map((f) => {
    const w = weights[f.key] ?? 0;
    const contribution = (f.raw / 100) * w * 100;
    return { ...f, weight: w, contribution: Math.round(contribution * 100) / 100 };
  });

  const score = withContribution.reduce((acc, f) => acc + f.contribution, 0);
  return {
    score: Math.round(Math.min(100, Math.max(0, score)) * 10) / 10,
    factors: withContribution,
  };
}

/** Board-wide context precomputation (single pass over open work). */
export function buildContext(now = Date.now()) {
  const openTasks = all(
    `SELECT t.*, p.priority AS project_priority, ph.due_at AS phase_due_at
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN phases ph ON ph.id = t.phase_id
      WHERE t.status <> 'done'`,
  );

  const dependents = all("SELECT * FROM task_dependencies");
  const blockersOf = new Map();
  for (const d of dependents) {
    if (!blockersOf.has(d.depends_on_id)) blockersOf.set(d.depends_on_id, []);
    blockersOf.get(d.depends_on_id).push({ id: d.task_id, ...d });
  }
  // resolve status of dependents
  const statusById = new Map(openTasks.map((t) => [t.id, t.status]));
  for (const [, list] of blockersOf) {
    for (const item of list) item.status = statusById.get(item.id) ?? "done";
  }

  const openPerUser = new Map();
  for (const t of openTasks) {
    if (t.assignee_id) {
      openPerUser.set(t.assignee_id, (openPerUser.get(t.assignee_id) ?? 0) + 1);
    }
  }

  const capacity = new Map(
    all("SELECT id, capacity_hours_week FROM users WHERE active = 1").map((u) => [
      u.id,
      u.capacity_hours_week,
    ]),
  );

  return { now, openTasks, blockersOf, openPerUser, capacity };
}

/** Re-score every open task and persist rank_score + top factors. */
export function recomputeRanks({ persist = true } = {}) {
  const ctx = buildContext();
  const weights = getWeights();
  const scored = ctx.openTasks.map((task) => {
    const { score, factors } = scoreTask(task, ctx, weights);
    return { task, score, factors };
  });

  scored.sort((a, b) => b.score - a.score);

  if (persist) {
    for (const row of scored) {
      run(
        "UPDATE tasks SET rank_score = ?, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = ?",
        row.score,
        row.task.id,
      );
    }
  }

  return scored.map((row) => ({
    id: row.task.id,
    title: row.task.title,
    status: row.task.status,
    priority: row.task.priority,
    project_id: row.task.project_id,
    assignee_id: row.task.assignee_id,
    score: row.score,
    factors: row.factors,
    topReason: row.factors.reduce((a, b) => (a.contribution > b.contribution ? a : b)).label,
  }));
}

/** Simple load-balancing suggestion: who should take the next critical task. */
export function suggestAssignees(taskId) {
  const task = get("SELECT * FROM tasks WHERE id = ?", taskId);
  if (!task) return [];
  const users = all(
    `SELECT u.id, u.name, u.role, u.capacity_hours_week,
            SUM(CASE WHEN t.status NOT IN ('done') THEN 1 ELSE 0 END) AS open_tasks,
            SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS wip
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id
      WHERE u.active = 1 AND u.role IN ('dev','qa','lead')
      GROUP BY u.id`,
  );
  return users
    .map((u) => {
      const wipPenalty = (u.wip ?? 0) * 12;
      const load = ((u.open_tasks ?? 0) / Math.max(1, u.capacity_hours_week / 8)) * 25;
      const roleBonus =
        task.type === "qa" && u.role === "qa" ? 25 : task.type !== "qa" && u.role === "dev" ? 15 : 0;
      const score = Math.max(0, 100 - wipPenalty - load + roleBonus);
      return {
        user_id: u.id,
        name: u.name,
        role: u.role,
        open_tasks: u.open_tasks ?? 0,
        wip: u.wip ?? 0,
        fit: Math.round(score),
      };
    })
    .sort((a, b) => b.fit - a.fit);
}

/**
 * Service layer — orchestrates repositories, enforces domain rules
 * (turnover SLA stamping, activity journal, AI re-rank), emits bus events.
 */
import { EventEmitter } from "node:events";
import * as repo from "../repositories/index.js";
import { tx, get, all, run } from "../db/connection.js";
import { recomputeRanks, scoreTask, buildContext, suggestAssignees, getWeights } from "../domain/ai.js";
import { slaState } from "../domain/sla.js";

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const HOUR = 3600_000;

function journal(actorId, entity, entityId, action, summary, payload) {
  repo.activities.record({ actor_id: actorId, entity, entity_id: entityId, action, summary, payload });
  bus.emit("activity", {
    actor_id: actorId,
    entity,
    entity_id: entityId,
    action,
    summary,
    created_at: Date.now(),
  });
}

/* ────────────────────────────── auth ─────────────────────────────── */

export const authService = {
  me(userId) {
    const user = repo.users.byId(userId);
    if (!user) throw Object.assign(new Error("User not found"), { status: 401 });
    return user;
  },
  touch(userId) {
    repo.users.touch(userId);
  },
};

/* ───────────────────────────── tasks ─────────────────────────────── */

export const taskService = {
  list(filters) {
    return repo.tasks.list(filters);
  },
  get(id) {
    const task = repo.tasks.byId(id);
    if (!task) return null;
    return {
      ...task,
      labels: Array.isArray(task.labels) ? task.labels : [],
      dependencies: repo.tasks.dependencies(id),
      comments: repo.comments.forTask(id),
      activity: repo.activities.forEntity("task", id),
    };
  },
  create(data, actorId) {
    const task = repo.tasks.create(data);
    journal(actorId, "task", task.id, "created", `created task “${task.title}”`, {
      project_id: task.project_id,
    });
    this.rank();
    return repo.tasks.byId(task.id);
  },
  update(id, patch, actorId) {
    const before = repo.tasks.byId(id);
    if (!before) return null;
    const task = repo.tasks.update(id, patch);
    const changes = Object.keys(patch).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(patch[k]));
    if (changes.length) {
      journal(actorId, "task", id, "updated", `updated task “${task.title}”`, { changes });
    }
    this.rank();
    return repo.tasks.byId(id);
  },
  move(id, status, position, actorId) {
    const before = repo.tasks.byId(id);
    if (!before) return null;
    const task = repo.tasks.move(id, status, position);
    if (before.status !== status) {
      journal(
        actorId, "task", id, "moved",
        `moved “${task.title}” ${before.status} → ${status}`,
        { from: before.status, to: status },
      );
    }
    this.rank();
    bus.emit("board", { op: "move", task_id: id, status });
    return repo.tasks.byId(id);
  },
  remove(id, actorId) {
    const task = repo.tasks.byId(id);
    if (!task) return 0;
    const changes = repo.tasks.remove(id);
    if (changes) journal(actorId, "task", id, "deleted", `deleted task “${task.title}”`);
    this.rank();
    return changes;
  },
  comment(taskId, authorId, body) {
    const comment = repo.comments.create(taskId, authorId, body);
    const task = repo.tasks.byId(taskId);
    journal(authorId, "task", taskId, "commented", `commented on “${task?.title ?? "task"}”`);
    bus.emit("comment", { task_id: taskId, comment });
    return comment;
  },
  addDependency(taskId, dependsOnId, actorId) {
    repo.tasks.addDependency(taskId, dependsOnId);
    journal(actorId, "task", taskId, "dependency", "added a blocking dependency", { dependsOnId });
    this.rank();
  },
  removeDependency(taskId, dependsOnId, actorId) {
    repo.tasks.removeDependency(taskId, dependsOnId);
    journal(actorId, "task", taskId, "dependency", "removed a blocking dependency", { dependsOnId });
    this.rank();
  },
  /** Recompute AI ranks across open work (debounced by caller if needed). */
  rank() {
    return recomputeRanks({ persist: true });
  },
  priorityQueue(limit = 10) {
    return recomputeRanks({ persist: false }).slice(0, limit);
  },
  suggestAssignees(taskId) {
    return suggestAssignees(taskId);
  },
};

/* ───────────────────────────── clients ───────────────────────────── */

export const clientService = {
  list() {
    return repo.clients.list();
  },
  get(id) {
    const client = repo.clients.byId(id);
    if (!client) return null;
    const projects = repo.projects.list({ client_id: id });
    return {
      ...client,
      projects,
      stage_sla: slaState(client.stage_entered_at + stageBudgetMs(client.stage)),
    };
  },
  create(data, actorId) {
    const client = repo.clients.create(data);
    journal(actorId, "client", client.id, "created", `added client ${client.company}`);
    bus.emit("pipeline", { op: "create" });
    return client;
  },
  update(id, patch, actorId) {
    const before = repo.clients.byId(id);
    if (!before) return null;
    const client = repo.clients.update(id, patch);
    if (patch.stage && patch.stage !== before.stage) {
      journal(
        actorId, "client", id, "stage",
        `advanced ${client.company}: ${before.stage} → ${patch.stage}`,
        { from: before.stage, to: patch.stage },
      );
      bus.emit("pipeline", { op: "stage", client_id: id, stage: patch.stage });
    } else {
      journal(actorId, "client", id, "updated", `updated client ${client.company}`);
      bus.emit("pipeline", { op: "update" });
    }
    return client;
  },
  remove(id, actorId) {
    const client = repo.clients.byId(id);
    const changes = repo.clients.remove(id);
    if (changes) journal(actorId, "client", id, "deleted", `removed client ${client?.company}`);
    bus.emit("pipeline", { op: "delete" });
    return changes;
  },
  stageCounts() {
    return repo.clients.stageCounts();
  },
};

/** Soft per-stage budget (used for pipeline countdown badges). */
function stageBudgetMs(stage) {
  const budgets = {
    outreach: 72 * HOUR,
    initial_consultation: 72 * HOUR,          // plan delta ≤ 3 days
    technical_consultation: 72 * HOUR,
    planning: 32 * HOUR,                       // response ≤ 12–32h
    kickoff: 168 * HOUR,
    development: 14 * 24 * HOUR,               // client cycle ≤ 2 weeks
    qa: 12 * HOUR,                             // QA report ≤ 12h
    shipping: 5 * 24 * HOUR,                   // ship after demo ≤ 5 days
    maintenance: 30 * 24 * HOUR,
    won: 0,
    lost: 0,
  };
  return budgets[stage] ?? 72 * HOUR;
}

/* ──────────────────────────── projects ───────────────────────────── */

const DEFAULT_PHASES = [
  { key: "spec", name: "Spec & architecture", sla_hours: 72 },
  { key: "build", name: "Development modules", sla_hours: 168 },
  { key: "qa", name: "QA & test reports", sla_hours: 12 },
  { key: "demo", name: "Demo & approval", sla_hours: 336 },
  { key: "ship", name: "Ship & deploy", sla_hours: 120 },
  { key: "handover", name: "Handover & maintenance", sla_hours: 720 },
];

export const projectService = {
  list(filters) {
    return repo.projects.list(filters);
  },
  get(id) {
    const project = repo.projects.byId(id);
    if (!project) return null;
    const phases = repo.phases.forProject(id).map((ph) => ({
      ...ph,
      sla: slaState(ph.due_at),
    }));
    const projectTasks = repo.tasks.list({ project_id: id });
    return { ...project, phases, tasks: projectTasks };
  },
  create(data, actorId) {
    const project = tx(() => {
      const created = repo.projects.create(data);
      // default delivery phases derived from the pipeline doc
      let order = 1;
      for (const ph of DEFAULT_PHASES) {
        repo.phases.create({
          project_id: created.id,
          key: ph.key,
          name: ph.name,
          order_no: order++,
          sla_hours: ph.sla_hours,
          status: ph.key === "spec" ? "active" : "pending",
          started_at: ph.key === "spec" ? Date.now() : null,
          due_at: ph.key === "spec" ? Date.now() + ph.sla_hours * HOUR : null,
        });
      }
      return created;
    });
    journal(actorId, "project", project.id, "created", `created project ${project.code} — ${project.name}`);
    bus.emit("board", { op: "project" });
    return this.get(project.id);
  },
  update(id, patch, actorId) {
    const project = repo.projects.update(id, patch);
    if (project) journal(actorId, "project", id, "updated", `updated project ${project.code}`);
    return project;
  },
  remove(id, actorId) {
    const project = repo.projects.byId(id);
    const changes = repo.projects.remove(id);
    if (changes) journal(actorId, "project", id, "deleted", `archived project ${project?.code}`);
    return changes;
  },
  /** Move a phase through its lifecycle, stamping turnover timestamps. */
  advancePhase(phaseId, status, actorId) {
    const phase = repo.phases.byId(phaseId);
    if (!phase) return null;
    const patch = { status };
    if (status === "active" && !phase.started_at) {
      patch.started_at = Date.now();
      patch.due_at = Date.now() + phase.sla_hours * HOUR;
    }
    if (status === "done") patch.completed_at = Date.now();
    const updated = repo.phases.update(phaseId, patch);
    journal(
      actorId, "phase", phaseId, "advance",
      `phase “${phase.name}” → ${status}`,
      { project_id: phase.project_id },
    );
    bus.emit("board", { op: "phase", project_id: phase.project_id });
    return updated;
  },
};

/* ──────────────────────────── dashboard ──────────────────────────── */

export const dashboardService = {
  summary() {
    const now = Date.now();
    const kpis = get(`
      SELECT
        (SELECT COUNT(*) FROM projects WHERE status = 'active') AS active_projects,
        (SELECT COUNT(*) FROM tasks WHERE status NOT IN ('done')) AS open_tasks,
        (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress') AS wip,
        (SELECT COUNT(*) FROM tasks WHERE status = 'done' AND completed_at > ?) AS done_7d,
        (SELECT COUNT(*) FROM tasks WHERE status <> 'done' AND due_at IS NOT NULL AND due_at < ?) AS overdue,
        (SELECT COUNT(*) FROM clients WHERE status = 'lead') AS leads,
        (SELECT COUNT(*) FROM clients WHERE stage NOT IN ('won','lost')) AS pipeline_active,
        (SELECT COALESCE(SUM(estimate_hours),0) FROM tasks WHERE status <> 'done') AS open_hours
      `, now - 7 * 24 * HOUR, now);

    const health = turnoverHealthSnapshot(now);
    const byStatus = all("SELECT status, COUNT(*) AS count FROM tasks GROUP BY status");
    const byPriority = all(
      "SELECT priority, COUNT(*) AS count FROM tasks WHERE status <> 'done' GROUP BY priority",
    );
    const throughput = all(
      `SELECT strftime('%Y-%m-%d', completed_at/1000, 'unixepoch') AS day, COUNT(*) AS count
         FROM tasks WHERE status = 'done' AND completed_at > ?
        GROUP BY day ORDER BY day`,
      now - 14 * 24 * HOUR,
    );
    const priorityQueue = taskService.priorityQueue(8);
    const workload = repo.users.workload();
    const activities = repo.activities.recent(12);
    const stageCounts = repo.clients.stageCounts();

    return {
      kpis: {
        ...kpis,
        compliance_pct: health.compliance.pct,
        breached: health.breachedPhases.length + health.breachedTasks.length,
        at_risk: health.atRiskPhases.length,
      },
      byStatus,
      byPriority,
      throughput,
      priorityQueue,
      workload,
      activities,
      stageCounts,
      health: {
        breachedPhases: health.breachedPhases,
        atRiskPhases: health.atRiskPhases,
        breachedTasks: health.breachedTasks.slice(0, 8),
        dueToday: health.dueToday.slice(0, 8),
        compliance: health.compliance,
      },
    };
  },
};

function turnoverHealthSnapshot(now) {
  const phasesActive = all(
    `SELECT p.id, p.key, p.name, p.due_at, p.status, pr.name AS project_name, pr.code
       FROM phases p JOIN projects pr ON pr.id = p.project_id
      WHERE p.status = 'active' AND p.due_at IS NOT NULL`,
  ).map((p) => ({ ...p, sla: slaState(p.due_at, now) }));

  const tasksDue = all(
    `SELECT t.id, t.title, t.due_at, t.status, t.priority, pr.code AS project_code
       FROM tasks t JOIN projects pr ON pr.id = t.project_id
      WHERE t.status <> 'done' AND t.due_at IS NOT NULL`,
  ).map((t) => ({ ...t, sla: slaState(t.due_at, now) }));

  const completed = get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN completed_at IS NOT NULL AND due_at IS NOT NULL
                      AND completed_at <= due_at THEN 1 ELSE 0 END) AS on_time
       FROM phases WHERE status = 'done' AND due_at IS NOT NULL`,
  );

  const total = completed?.total ?? 0;
  const onTime = completed?.on_time ?? 0;
  return {
    phases: phasesActive,
    breachedPhases: phasesActive.filter((p) => p.sla.state === "breached"),
    atRiskPhases: phasesActive.filter((p) => ["critical", "warning"].includes(p.sla.state)),
    breachedTasks: tasksDue.filter((t) => t.sla.state === "breached"),
    dueToday: tasksDue.filter((t) => t.sla.ms >= 0 && t.sla.ms < 24 * HOUR),
    compliance: { onTime, total, pct: total ? Math.round((onTime / total) * 100) : 100 },
  };
}

/* ────────────────────────────── ai ───────────────────────────────── */

export const aiService = {
  ranks(limit) {
    const rows = taskService.priorityQueue(limit ?? 50);
    return rows;
  },
  scoreTask(id) {
    const task = get(
      `SELECT t.*, p.priority AS project_priority, ph.due_at AS phase_due_at
         FROM tasks t JOIN projects p ON p.id = t.project_id
         LEFT JOIN phases ph ON ph.id = t.phase_id WHERE t.id = ?`,
      id,
    );
    if (!task) return null;
    const ctx = buildContext();
    return scoreTask(task, ctx);
  },
  weights() {
    return getWeights();
  },
};

export { recomputeRanks };

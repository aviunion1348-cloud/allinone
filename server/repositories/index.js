/** Repository layer — all SQL lives here; services never touch SQL directly. */
import { all, get, run, tx } from "../db/connection.js";

/* ────────────────────────────── users ────────────────────────────── */

export const users = {
  list() {
    return all(
      `SELECT id, email, name, role, title, color, capacity_hours_week, timezone, active, last_seen_at, created_at
         FROM users ORDER BY name`,
    );
  },
  byId(id) {
    return get(
      `SELECT id, email, name, role, title, color, capacity_hours_week, timezone, active, last_seen_at, created_at
         FROM users WHERE id = ?`,
      id,
    );
  },
  byEmail(email) {
    return get("SELECT * FROM users WHERE email = ?", email);
  },
  create({ email, name, password_hash, role = "dev", title, color, capacity_hours_week = 32, timezone = "Asia/Kolkata" }) {
    const { lastInsertRowid } = run(
      `INSERT INTO users (email, name, password_hash, role, title, color, capacity_hours_week, timezone)
       VALUES (?,?,?,?,?,?,?,?)`,
      email, name, password_hash, role, title ?? null, color ?? "#e8b923", capacity_hours_week, timezone,
    );
    return this.byId(lastInsertRowid);
  },
  touch(id) {
    run("UPDATE users SET last_seen_at = ? WHERE id = ?", Date.now(), id);
  },
  workload() {
    return all(
      `SELECT u.id, u.name, u.role, u.color, u.capacity_hours_week,
              COUNT(t.id) FILTER (WHERE t.status NOT IN ('done')) AS open_tasks,
              COUNT(t.id) FILTER (WHERE t.status = 'in_progress') AS wip,
              COALESCE(SUM(t.estimate_hours) FILTER (WHERE t.status NOT IN ('done')), 0) AS open_hours
         FROM users u
         LEFT JOIN tasks t ON t.assignee_id = u.id
        WHERE u.active = 1
        GROUP BY u.id ORDER BY open_tasks DESC`,
    );
  },
};

/* ───────────────────────────── clients ───────────────────────────── */

export const clients = {
  list() {
    return all(
      `SELECT c.*, u.name AS owner_name,
              (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
         FROM clients c LEFT JOIN users u ON u.id = c.owner_id
        ORDER BY c.stage_entered_at DESC`,
    );
  },
  byId(id) {
    return get(
      `SELECT c.*, u.name AS owner_name FROM clients c
         LEFT JOIN users u ON u.id = c.owner_id WHERE c.id = ?`,
      id,
    );
  },
  create(data) {
    const { lastInsertRowid } = run(
      `INSERT INTO clients (name, company, contact_name, email, persona, region, stage, status, deal_band, notes, owner_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      data.name, data.company, data.contact_name ?? null, data.email ?? null,
      data.persona ?? null, data.region ?? null, data.stage ?? "outreach",
      data.status ?? "lead", data.deal_band ?? null, data.notes ?? null, data.owner_id ?? null,
    );
    return this.byId(lastInsertRowid);
  },
  update(id, patch) {
    const allowed = ["name","company","contact_name","email","persona","region","stage","status","deal_band","notes","owner_id"];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = ?`);
        vals.push(patch[key] ?? null);
      }
    }
    if (patch.stage) {
      sets.push("stage_entered_at = ?");
      vals.push(Date.now());
    }
    if (!sets.length) return this.byId(id);
    vals.push(id);
    run(`UPDATE clients SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    return this.byId(id);
  },
  stageCounts() {
    return all("SELECT stage, COUNT(*) AS count FROM clients GROUP BY stage");
  },
  remove(id) {
    return run("DELETE FROM clients WHERE id = ?", id).changes;
  },
};

/* ──────────────────────────── projects ───────────────────────────── */

export const projects = {
  list({ status, client_id } = {}) {
    const where = [];
    const vals = [];
    if (status) { where.push("p.status = ?"); vals.push(status); }
    if (client_id) { where.push("p.client_id = ?"); vals.push(client_id); }
    const sql = `
      SELECT p.*, c.name AS client_name, c.company AS client_company, c.stage AS client_stage,
             u.name AS lead_name,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status <> 'done') AS open_tasks,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
             (SELECT COUNT(*) FROM phases ph WHERE ph.project_id = p.id AND ph.status = 'done') AS phases_done,
             (SELECT COUNT(*) FROM phases ph WHERE ph.project_id = p.id) AS phases_total,
             (SELECT MIN(due_at) FROM phases ph WHERE ph.project_id = p.id AND ph.status = 'active') AS active_due_at
        FROM projects p
        JOIN clients c ON c.id = p.client_id
        LEFT JOIN users u ON u.id = p.lead_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY CASE p.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                p.target_date ASC`;
    return all(sql, ...vals);
  },
  byId(id) {
    return get(
      `SELECT p.*, c.name AS client_name, c.company AS client_company, c.stage AS client_stage,
              c.persona AS client_persona, u.name AS lead_name
         FROM projects p
         JOIN clients c ON c.id = p.client_id
         LEFT JOIN users u ON u.id = p.lead_id
        WHERE p.id = ?`,
      id,
    );
  },
  create(data) {
    const { lastInsertRowid } = run(
      `INSERT INTO projects (code, name, description, client_id, lead_id, status, priority, start_date, target_date, budget_hours, repo_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      data.code, data.name, data.description ?? null, data.client_id, data.lead_id ?? null,
      data.status ?? "planning", data.priority ?? "medium",
      data.start_date ?? null, data.target_date ?? null, data.budget_hours ?? 0, data.repo_url ?? null,
    );
    return this.byId(lastInsertRowid);
  },
  update(id, patch) {
    const allowed = ["name","description","lead_id","status","priority","start_date","target_date","budget_hours","repo_url"];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in patch) { sets.push(`${key} = ?`); vals.push(patch[key] ?? null); }
    }
    if (!sets.length) return this.byId(id);
    vals.push(id);
    run(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    return this.byId(id);
  },
  remove(id) {
    return run("DELETE FROM projects WHERE id = ?", id).changes;
  },
};

/* ───────────────────────────── phases ────────────────────────────── */

export const phases = {
  forProject(projectId) {
    return all("SELECT * FROM phases WHERE project_id = ? ORDER BY order_no", projectId);
  },
  byId(id) {
    return get("SELECT * FROM phases WHERE id = ?", id);
  },
  create(data) {
    const { lastInsertRowid } = run(
      `INSERT INTO phases (project_id, key, name, order_no, status, sla_hours, started_at, due_at, notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      data.project_id, data.key, data.name, data.order_no, data.status ?? "pending",
      data.sla_hours ?? 168, data.started_at ?? null, data.due_at ?? null, data.notes ?? null,
    );
    return this.byId(lastInsertRowid);
  },
  update(id, patch) {
    const allowed = ["name","order_no","status","sla_hours","started_at","due_at","completed_at","notes"];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in patch) { sets.push(`${key} = ?`); vals.push(patch[key] ?? null); }
    }
    if (!sets.length) return this.byId(id);
    vals.push(id);
    run(`UPDATE phases SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    return this.byId(id);
  },
  /** Advance a phase to done, stamping completion time. */
  complete(id) {
    return this.update(id, { status: "done", completed_at: Date.now() });
  },
};

/* ────────────────────────────── tasks ────────────────────────────── */

const TASK_SELECT = `
  SELECT t.*,
         p.name AS project_name, p.code AS project_code, p.priority AS project_priority,
         p.status AS project_status,
         a.name AS assignee_name, a.color AS assignee_color, a.role AS assignee_role,
         r.name AS reporter_name,
         ph.name AS phase_name, ph.key AS phase_key, ph.due_at AS phase_due_at,
         (SELECT COUNT(*) FROM task_dependencies d WHERE d.depends_on_id = t.id AND d.task_id IN
            (SELECT id FROM tasks WHERE status <> 'done')) AS blocked_by_count,
         (SELECT COUNT(*) FROM comments c WHERE c.task_id = t.id) AS comment_count
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users r ON r.id = t.reporter_id
    LEFT JOIN phases ph ON ph.id = t.phase_id`;

/** JSON columns → JS values (keeps API responses consistent). */
function hydrateTask(row) {
  if (!row) return row;
  if (typeof row.labels === "string") {
    try {
      row.labels = JSON.parse(row.labels);
    } catch {
      row.labels = [];
    }
  }
  return row;
}

export const tasks = {
  list({ project_id, assignee_id, status, priority, type, q, phase_id } = {}) {
    const where = [];
    const vals = [];
    if (project_id) { where.push("t.project_id = ?"); vals.push(project_id); }
    if (assignee_id) { where.push("t.assignee_id = ?"); vals.push(assignee_id); }
    if (phase_id) { where.push("t.phase_id = ?"); vals.push(phase_id); }
    if (status) {
      const statuses = String(status).split(",");
      where.push(`t.status IN (${statuses.map(() => "?").join(",")})`);
      vals.push(...statuses);
    }
    if (priority) { where.push("t.priority = ?"); vals.push(priority); }
    if (type) { where.push("t.type = ?"); vals.push(type); }
    if (q) { where.push("(t.title LIKE ? OR t.description LIKE ?)"); vals.push(`%${q}%`, `%${q}%`); }
    const sql = `${TASK_SELECT}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY t.rank_score DESC, t.position ASC, t.id DESC`;
    return all(sql, ...vals).map(hydrateTask);
  },
  byId(id) {
    return hydrateTask(get(`${TASK_SELECT} WHERE t.id = ?`, id));
  },
  create(data) {
    const { lastInsertRowid } = run(
      `INSERT INTO tasks (project_id, phase_id, assignee_id, reporter_id, title, description, type,
                          status, priority, estimate_hours, due_at, labels, position)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      data.project_id, data.phase_id ?? null, data.assignee_id ?? null, data.reporter_id ?? null,
      data.title, data.description ?? null, data.type ?? "feature",
      data.status ?? "backlog", data.priority ?? "medium", data.estimate_hours ?? 0,
      data.due_at ?? null, JSON.stringify(data.labels ?? []),
      data.position ?? 0,
    );
    return this.byId(lastInsertRowid);
  },
  update(id, patch) {
    const allowed = [
      "phase_id","assignee_id","title","description","type","status","priority",
      "estimate_hours","spent_hours","due_at","labels","position","completed_at","started_at",
    ];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in patch) {
        sets.push(`${key} = ?`);
        vals.push(key === "labels" ? JSON.stringify(patch[key] ?? []) : patch[key] ?? null);
      }
    }
    if (patch.status === "done" && !("completed_at" in patch)) {
      sets.push("completed_at = ?");
      vals.push(Date.now());
    }
    if (patch.status === "in_progress" && !("started_at" in patch)) {
      sets.push("started_at = ?");
      vals.push(Date.now());
    }
    if (patch.status && patch.status !== "done") {
      sets.push("completed_at = NULL");
    }
    if (!sets.length) return this.byId(id);
    vals.push(id);
    run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    return this.byId(id);
  },
  remove(id) {
    return tx(() => {
      run("DELETE FROM task_dependencies WHERE task_id = ? OR depends_on_id = ?", id, id);
      return run("DELETE FROM tasks WHERE id = ?", id).changes;
    });
  },
  move(id, status, position) {
    const sets = ["status = ?"];
    const vals = [status];
    if (position !== undefined) { sets.push("position = ?"); vals.push(position); }
    if (status === "done") { sets.push("completed_at = ?"); vals.push(Date.now()); }
    if (status === "in_progress") { sets.push("started_at = COALESCE(started_at, ?)"); vals.push(Date.now()); }
    if (status !== "done") sets.push("completed_at = NULL");
    vals.push(id);
    run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, ...vals);
    return this.byId(id);
  },
  dependencies(taskId) {
    return all(
      `SELECT d.depends_on_id AS id, t.title, t.status, t.priority
         FROM task_dependencies d JOIN tasks t ON t.id = d.depends_on_id
        WHERE d.task_id = ?`,
      taskId,
    );
  },
  addDependency(taskId, dependsOnId) {
    if (taskId === dependsOnId) throw new Error("task cannot depend on itself");
    run(
      "INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?,?)",
      taskId, dependsOnId,
    );
  },
  removeDependency(taskId, dependsOnId) {
    run(
      "DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?",
      taskId, dependsOnId,
    );
  },
  /** Kanban column payloads in rank order. */
  board({ project_id } = {}) {
    const rows = this.list(project_id ? { project_id } : {});
    const columns = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
    const board = Object.fromEntries(columns.map((c) => [c, []]));
    for (const row of rows) (board[row.status] ??= []).push(row);
    return board;
  },
};

/* ──────────────────────────── comments ───────────────────────────── */

export const comments = {
  forTask(taskId) {
    return all(
      `SELECT c.*, u.name AS author_name, u.color AS author_color
         FROM comments c LEFT JOIN users u ON u.id = c.author_id
        WHERE c.task_id = ? ORDER BY c.created_at ASC`,
      taskId,
    );
  },
  create(taskId, authorId, body) {
    const { lastInsertRowid } = run(
      "INSERT INTO comments (task_id, author_id, body) VALUES (?,?,?)",
      taskId, authorId, body,
    );
    return get(
      `SELECT c.*, u.name AS author_name, u.color AS author_color
         FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
      lastInsertRowid,
    );
  },
};

/* ──────────────────────────── activities ─────────────────────────── */

export const activities = {
  record({ actor_id, entity, entity_id, action, summary, payload }) {
    run(
      `INSERT INTO activities (actor_id, entity, entity_id, action, summary, payload)
       VALUES (?,?,?,?,?,?)`,
      actor_id ?? null, entity, entity_id, action, summary,
      payload ? JSON.stringify(payload) : null,
    );
  },
  recent(limit = 40) {
    return all(
      `SELECT a.*, u.name AS actor_name, u.color AS actor_color
         FROM activities a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT ?`,
      limit,
    );
  },
  forEntity(entity, entityId) {
    return all(
      `SELECT a.*, u.name AS actor_name FROM activities a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.entity = ? AND a.entity_id = ?
        ORDER BY a.created_at DESC`,
      entity, entityId,
    );
  },
};

/* ──────────────────────────── settings ──────────────────────────── */

export const settings = {
  get(key) {
    const row = get("SELECT value FROM settings WHERE key = ?", key);
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },
  set(key, value) {
    run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
           updated_at = CAST(strftime('%s','now') AS INTEGER)*1000`,
      key, JSON.stringify(value),
    );
    return value;
  },
};

/* ──────────────────────────── releases ──────────────────────────── */

export const releases = {
  list({ project_id } = {}) {
    return all(
      `SELECT r.*, p.name AS project_name, p.code AS project_code, u.name AS created_by_name
         FROM releases r
         JOIN projects p ON p.id = r.project_id
         LEFT JOIN users u ON u.id = r.created_by
        ${project_id ? "WHERE r.project_id = ?" : ""}
        ORDER BY CASE r.status WHEN 'staging' THEN 0 WHEN 'planned' THEN 1
                               WHEN 'shipped' THEN 2 ELSE 3 END,
                 r.created_at DESC`,
      ...(project_id ? [project_id] : []),
    );
  },
  byId(id) {
    return get(
      `SELECT r.*, p.name AS project_name, p.code AS project_code
         FROM releases r JOIN projects p ON p.id = r.project_id WHERE r.id = ?`,
      id,
    );
  },
  create(data) {
    const now = Date.now();
    const { lastInsertRowid } = run(
      `INSERT INTO releases (project_id, name, version, status, notes, shipped_at, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      data.project_id, data.name, data.version ?? null, data.status ?? "planned",
      data.notes ?? null, data.status === "shipped" ? now : null,
      data.created_by ?? null, now, now,
    );
    return this.byId(lastInsertRowid);
  },
  update(id, patch) {
    const cur = this.byId(id);
    if (!cur) return null;
    const status = patch.status ?? cur.status;
    const shipped_at = status === "shipped" ? (cur.shipped_at ?? Date.now()) : null;
    run(
      "UPDATE releases SET name=?, version=?, status=?, notes=?, shipped_at=? WHERE id=?",
      patch.name ?? cur.name,
      patch.version !== undefined ? patch.version : cur.version,
      status,
      patch.notes !== undefined ? patch.notes : cur.notes,
      shipped_at,
      id,
    );
    return this.byId(id);
  },
  remove(id) {
    return run("DELETE FROM releases WHERE id = ?", id).changes;
  },
};

/* ─────────────── command deck aggregates (clocks/planning/qa) ───── */

export const aggregates = {
  activePhases() {
    return all(
      `SELECT ph.id, ph.project_id, ph.key, ph.name, ph.status, ph.sla_hours,
              ph.started_at, ph.due_at, ph.completed_at,
              p.code AS project_code, p.name AS project_name
         FROM phases ph JOIN projects p ON p.id = ph.project_id
        WHERE ph.status = 'active' AND ph.due_at IS NOT NULL
        ORDER BY ph.due_at`,
    );
  },
  dueTasks(limit = 40) {
    return all(
      `SELECT t.id, t.title, t.due_at, t.status, t.priority, t.type,
              u.name AS assignee_name, u.color AS assignee_color,
              p.name AS project_name, p.code AS project_code
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.status NOT IN ('done') AND t.due_at IS NOT NULL
        ORDER BY t.due_at LIMIT ?`,
      limit,
    );
  },
  projectCapacity() {
    return all(
      `SELECT p.id, p.code, p.name, p.status, p.priority, p.budget_hours,
              COALESCE(SUM(t.estimate_hours) FILTER (WHERE t.status NOT IN ('done')), 0) AS open_hours,
              COUNT(t.id) FILTER (WHERE t.status NOT IN ('done')) AS open_tasks,
              COUNT(t.id) FILTER (WHERE t.assignee_id IS NULL AND t.status NOT IN ('done')) AS unassigned_tasks
         FROM projects p
         LEFT JOIN tasks t ON t.project_id = p.id
        WHERE p.status IN ('planning','active','on_hold')
        GROUP BY p.id ORDER BY p.name`,
    );
  },
  unassignedOpenTasks() {
    return get("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id IS NULL AND status NOT IN ('done')").n;
  },
  qaTasks() {
    return all(
      `SELECT t.id, t.title, t.status, t.priority, t.type, t.due_at, t.estimate_hours,
              u.name AS assignee_name, p.name AS project_name, p.code AS project_code
         FROM tasks t JOIN projects p ON p.id = t.project_id
         LEFT JOIN users u ON u.id = t.assignee_id
        WHERE t.type IN ('qa','bug')
        ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1
                               WHEN 'in_review' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END,
                 t.due_at IS NULL, t.due_at`,
    );
  },
  qaStatusCounts() {
    return all(
      "SELECT status, COUNT(*) AS count FROM tasks WHERE type IN ('qa','bug') GROUP BY status",
    );
  },
};

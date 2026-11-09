-- Aurum Ops — initial schema
-- Normalised (3NF), CHECK-constrained, FK-enforced, indexed on hot paths.
-- Timestamps are INTEGER unix epoch milliseconds.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- ─────────────────────────────── people ───────────────────────────────

CREATE TABLE users (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  email               TEXT    NOT NULL UNIQUE,
  name                TEXT    NOT NULL,
  password_hash       TEXT    NOT NULL,
  role                TEXT    NOT NULL DEFAULT 'dev'
                      CHECK (role IN ('admin','lead','qa','dev','viewer')),
  title               TEXT,
  color               TEXT    NOT NULL DEFAULT '#e8b923',
  capacity_hours_week REAL    NOT NULL DEFAULT 32
                      CHECK (capacity_hours_week > 0),
  timezone            TEXT    NOT NULL DEFAULT 'Asia/Kolkata',
  active              INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  last_seen_at        INTEGER,
  created_at          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at          INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- ─────────────────────────────── clients ──────────────────────────────

CREATE TABLE clients (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  company          TEXT NOT NULL,
  contact_name     TEXT,
  email            TEXT,
  persona          TEXT CHECK (persona IN ('dreamer','enthusiast','pessimistic')),
  region           TEXT CHECK (region IN ('india','emea','americas')),
  stage            TEXT NOT NULL DEFAULT 'outreach'
                   CHECK (stage IN (
                     'outreach','initial_consultation','technical_consultation',
                     'planning','kickoff','development','qa','shipping',
                     'maintenance','won','lost')),
  status           TEXT NOT NULL DEFAULT 'lead'
                   CHECK (status IN ('lead','active','paused','churned')),
  deal_band        TEXT CHECK (deal_band IN ('s','m','l','xl')),
  stage_entered_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  notes            TEXT,
  owner_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at       INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_clients_stage ON clients(stage);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_owner  ON clients(owner_id);

-- ─────────────────────────────── projects ─────────────────────────────

CREATE TABLE projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  description  TEXT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  lead_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT    NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active','on_hold','completed','archived')),
  priority     TEXT    NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('critical','high','medium','low')),
  start_date   INTEGER,
  target_date  INTEGER,
  budget_hours REAL    NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
  repo_url     TEXT,
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Delivery phases carry the strict turnover SLAs from the pipeline doc.
CREATE TABLE phases (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key          TEXT    NOT NULL,
  name         TEXT    NOT NULL,
  order_no     INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','blocked','done')),
  sla_hours    REAL    NOT NULL CHECK (sla_hours >= 0),
  started_at   INTEGER,
  due_at       INTEGER,
  completed_at INTEGER,
  notes        TEXT,
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS idx_phases_project ON phases(project_id, order_no);
CREATE INDEX IF NOT EXISTS idx_phases_status  ON phases(status);

-- ──────────────────────────────── tasks ───────────────────────────────

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id     INTEGER REFERENCES phases(id) ON DELETE SET NULL,
  assignee_id  INTEGER REFERENCES users(id)  ON DELETE SET NULL,
  reporter_id  INTEGER REFERENCES users(id)  ON DELETE SET NULL,
  title        TEXT    NOT NULL,
  description  TEXT,
  type         TEXT    NOT NULL DEFAULT 'feature'
               CHECK (type IN ('feature','bug','qa','research','chore','doc')),
  status       TEXT    NOT NULL DEFAULT 'backlog'
               CHECK (status IN ('backlog','todo','in_progress','in_review','blocked','done')),
  priority     TEXT    NOT NULL DEFAULT 'medium'
               CHECK (priority IN ('critical','high','medium','low')),
  estimate_hours REAL  NOT NULL DEFAULT 0 CHECK (estimate_hours >= 0),
  spent_hours    REAL  NOT NULL DEFAULT 0 CHECK (spent_hours >= 0),
  due_at       INTEGER,
  started_at   INTEGER,
  completed_at INTEGER,
  rank_score   REAL    NOT NULL DEFAULT 0,
  labels       TEXT    NOT NULL DEFAULT '[]',
  position     REAL    NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000),
  updated_at   INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_rank     ON tasks(rank_score DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_phase    ON tasks(phase_id);

CREATE TABLE task_dependencies (
  task_id        INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
);
CREATE INDEX IF NOT EXISTS idx_deps_blocker ON task_dependencies(depends_on_id);

CREATE TABLE comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);

-- Append-only audit trail powering the activity feed.
CREATE TABLE activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  entity     TEXT    NOT NULL,
  entity_id  INTEGER NOT NULL,
  action     TEXT    NOT NULL,
  summary    TEXT    NOT NULL,
  payload    TEXT,
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX IF NOT EXISTS idx_activities_recent ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON activities(entity, entity_id);

-- ──────────────────────── turnover SLA policies ───────────────────────
-- Values transcribed from the Excalidraw pipeline & roadmap document.

CREATE TABLE sla_policies (
  key         TEXT PRIMARY KEY,
  name        TEXT    NOT NULL,
  scope       TEXT    NOT NULL CHECK (scope IN ('pipeline','project','task','quality')),
  hours       REAL,
  value       REAL,
  unit        TEXT    NOT NULL DEFAULT 'hours',
  hard        INTEGER NOT NULL DEFAULT 1 CHECK (hard IN (0,1)),
  description TEXT
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);

-- ──────────────────────────── trigiggers ──────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_users_au    AFTER UPDATE ON users    BEGIN UPDATE users    SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_clients_au  AFTER UPDATE ON clients  BEGIN UPDATE clients  SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_projects_au AFTER UPDATE ON projects BEGIN UPDATE projects SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_phases_au   AFTER UPDATE ON phases   BEGIN UPDATE phases   SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;
CREATE TRIGGER IF NOT EXISTS trg_tasks_au    AFTER UPDATE ON tasks    BEGIN UPDATE tasks    SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;

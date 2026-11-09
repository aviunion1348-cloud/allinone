-- Release tracking (Command Deck → Releases): ship gate & rollout ledger.
CREATE TABLE releases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  version     TEXT,
  status      TEXT    NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned','staging','shipped','rolled_back')),
  notes       TEXT,
  shipped_at  INTEGER,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_releases_project ON releases(project_id);
CREATE INDEX idx_releases_status  ON releases(status);

CREATE TRIGGER IF NOT EXISTS trg_releases_au AFTER UPDATE ON releases
BEGIN UPDATE releases SET updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.id; END;

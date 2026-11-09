# Aurum Ops — Pipeline & Agile Command Center

**Black/gold glass + neomorphism internal tool** for running the full client lifecycle —
from *first technical consultation* to *handover & maintenance* — with strict,
machine-enforced **turnover SLAs** transcribed from the team's Excalidraw pipeline board.

> The Excalidraw source of truth (`#json=_z6CsPYBItOKkslJ_wN30,…`) is fetched,
> **AES-128-GCM decrypted and committed by CI** into [`docs/pipeline.md`](docs/pipeline.md)
> (human-readable) + [`docs/pipeline.excalidraw.json`](docs/pipeline.excalidraw.json) (full scene).

---

## Quick start

Requires **Node.js ≥ 22.13** (built-in `node:sqlite`; older versions get a
clear upgrade message at boot). Zero-vulnerability dependency tree (`npm audit` clean).

```bash
npm install
npm run dev          # http://localhost:4100  (auto-migrates + seeds on first run)
# or: npm start      # plain production-style boot
```

First run creates `data/aurum.sqlite`, applies migrations and seeds **only
company reference data**: the real team roster (10 users) and the 10 turnover
SLA policies transcribed from the Excalidraw pipeline document. Clients,
projects and tasks start **empty** — fill them with real engagements from the
app. (Databases created by older builds are cleaned once by migration
`002_purge_demo_data`.) Verified end-to-end from a clean clone:
`npm install && npm run dev`.

Admin login: **`avi@aurum.internal` / `aurum-2026`**
(team accounts: `hoE@`, `cto@`, `agrim@`, `aryan@`, … same password; override
the seeded password with `AURUM_SEED_PASSWORD` before first boot)

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with `--watch` (auto-migrates + seeds on empty DB) |
| `npm start` | Plain boot (same behaviour, no watcher) |
| `npm run migrate` | Apply pending SQL migrations |
| `npm test` | Domain unit tests + SPA jsdom smoke test |
| `npm run sync:excalidraw` | Re-fetch/decrypt the pipeline board (runs in CI) |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  public/  — SPA (hash router, zero build step)                     │
│  views: dashboard · board · pipeline · projects · roadmap · ai · team │
│  design system: glassmorphism + neomorphism, black/gold tokens     │
└──────────────────────────────┬─────────────────────────────────────┘
                               │  JSON /api/v1  (JWT httpOnly cookie)
┌──────────────────────────────▼─────────────────────────────────────┐
│  server/                                                           │
│  ├─ app.js          middleware chain (helmet CSP, compression,     │
│  │                  rate-limit, cookie, request-log)               │
│  ├─ routes/         REST v1 — zod validation, RBAC guards          │
│  ├─ middleware/     auth (JWT), validation, error envelope         │
│  ├─ services/       orchestration · activity journal · bus events  │
│  ├─ repositories/   ALL SQL lives here (single TASK_SELECT joins)  │
│  ├─ domain/         ai.js — explainable 8-factor ranking engine    │
│  │                  sla.js — turnover policy + breach detection    │
│  └─ db/             connection (WAL, FK on) · migrate · seed       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                    SQLite (node:sqlite, WAL)
                    data/aurum.sqlite  ← gitignored
```

### Layering rules

1. **Routes** parse/validate (zod) and shape HTTP — no business logic.
2. **Services** orchestrate repositories inside transactions, write the
   append-only `activities` audit trail, and emit bus events.
3. **Repositories** own every SQL statement; JSON columns are hydrated
   before leaving the layer.
4. **Domain** modules are pure(ish) and unit-tested: the AI scorer and the
   SLA state machine have no HTTP awareness.

### Database (3NF, enforced)

- **11 tables**: `users, clients, projects, phases, tasks, task_dependencies,
  comments, activities, sla_policies, settings, schema_migrations`
- `CHECK` constraints on every enum, `UNIQUE (project_id, key)` on phases,
  composite PK on the dependency join table, `CHECK (task_id <> depends_on_id)`
- FKs with explicit `ON DELETE` behaviour (CASCADE for owned rows,
  SET NULL for people, RESTRICT for clients-with-projects)
- 16 indexes tuned to the board/dashboard access patterns
- `AFTER UPDATE` triggers maintain `updated_at`
- WAL mode + `busy_timeout` + immediate transactions for write consistency
- Forward-only SQL migrations with a `schema_migrations` ledger

> No `db.json`. Real database, real constraints, real migrations.

---

## Turnover SLA policy (from the Excalidraw doc)

| Key | Rule |
| --- | --- |
| `plan_delta` | First consultation → plan discussion **≤ 3 days** |
| `plan_response` | Plan-change reply **≤ 12–32 h** |
| `module_dev` | Module turnover **≤ 1 day** |
| `milestone` | Milestone **≤ 1 week** |
| `client_cycle` | Client cycle **min 1 wk / max 2 wks** |
| `first_demo` | First demo **≤ 2 weeks** |
| `ship_after_demo` | Demo approval → ship **≤ 5 days** |
| `qa_report` | Any QA report **≤ 12 hours** |
| `exec_summary` | Exec summary **≥ 2 days** before ship date |
| `edge_cases` | **≥ 3500** edge cases before shipping |

These are **seeded rows** (`sla_policies`), drive live countdown badges on the
pipeline/board, and power the dashboard *turnover compliance* KPI
(on-time phases ÷ completed phases).

---

## AI prioritisation (explainable, tunable)

`server/domain/ai.js` scores every open task **0–100** as a weighted sum of 8 factors:

| Factor | Weight | Signal |
| --- | --- | --- |
| Intrinsic priority | 24 % | critical→100 … low→25 |
| Due-date urgency | 22 % | exponential-ish decay to due time |
| Turnover / SLA risk | 16 % | owning phase breach state (+QA bias) |
| Dependency leverage | 12 % | how many open tasks wait on this one |
| Effort (quick wins) | 8 % | ≤1 h → 95 … >16 h → 30 |
| Project priority | 8 % | owning project's priority |
| Staleness | 5 % | stale WIP rises for attention |
| Load balancing | 5 % | discounts overloaded assignees |

- Scores **persist** (`tasks.rank_score`) and recompute on every mutation.
- The task modal shows the **per-factor contribution breakdown** — nothing is a black box.
- Weights are normalised and tunable at `PATCH /api/v1/ai/weights` (admin/lead).

---

## API surface (`/api/v1`)

```
POST /auth/login · /auth/logout      GET /auth/me
GET  /dashboard                      GET  /users · /users/workload
GET  /clients · /clients/:id         POST/PATCH/DELETE /clients        (RBAC)
GET  /pipeline/stages
GET  /projects · /projects/:id       POST/PATCH/DELETE /projects       (RBAC)
POST /projects/:id/phases/:phaseId/advance
GET  /tasks · /tasks/board · /tasks/:id
POST /tasks · PATCH /tasks/:id · POST /tasks/:id/move · DELETE /tasks/:id
POST /tasks/:id/comments · /tasks/:id/depends-on · GET …/assignee-suggestions
GET  /ai/ranks · /ai/score/:id · /ai/weights · PATCH /ai/weights · POST /ai/recompute
GET  /sla/policies · /sla/health · /sla/task/:id
GET  /playbook                         (personas · roles · comms protocol)
GET  /activities · /roadmap · /health
```

Conventions: `{ error: { code, message, details? } }` envelope · zod 400s ·
JWT in `httpOnly` cookie (+ `Bearer` accepted) · role guard `admin | lead | qa | dev | viewer` ·
per-route rate limits (login 30/15min, API 600/min) · request logging with user id.

---

## CI: Excalidraw sync

`.github/workflows/sync-excalidraw.yml` runs `scripts/sync-excalidraw.mjs` on
pushes touching the script — it downloads the encrypted scene from
`json.excalidraw.com`, splits the Excalidraw `concatBuffers` framing,
AES-128-GCM decrypts with the link key, inflates (pako/zlib), and commits the
plaintext document back to the branch.

---

## Testing

```bash
npm test
# tests/domain.test.js   — SLA transcription + scoring invariants (node:test)
# tests/spa.smoke.test.js — renders all 7 views in jsdom against a live server
# tests/boot.e2e.test.js  — boots the REAL index.html + app.js end-to-end
```

`npm test` is fully self-contained: each suite boots its own server
(migrate + seed + listen) with a hermetic `/tmp` database, so it works on a
fresh clone with no manual setup — and releases the port on exit.

The **boot E2E** executes the real `index.html` + `app.js` exactly as a
browser does — login form → enterApp → router → every route — and asserts
the sidebar user chip, topbar SLA chip and zero runtime errors. It exists
because a DOM-structure drift (a missing `.sidebar-foot`) once crashed
`enterApp()` before the router ran, leaving a completely blank dashboard;
the view-level smoke test (own fixture HTML) could not see it. CI
(`.github/workflows/ci.yml`) runs `npm audit --audit-level=high` +
`npm test` on every push and PR, and `.github/workflows/deploy-probe.yml`
probes the live Vercel deployment (status + latency for every route,
report committed as `deploy-probe-report.md`).

---

## Deploy to Vercel

The repo ships with `vercel.json` + `api/index.js`: Vercel runs the whole
Express app (API **and** the static SPA) as one serverless function.

**Import settings**

- Framework Preset: **Other**
- **Root Directory: leave empty (repository root)** — do *not* point it at
  `public/`, otherwise only the static shell deploys and every API call
  (login included) 404s.
- Build & Development settings: defaults are fine (no build script needed).

**Environment variables** (Project → Settings → Environment Variables)

| Variable | Required | Purpose |
| --- | --- | --- |
| `AURUM_JWT_SECRET` | recommended | Keeps sessions valid across cold starts (otherwise a random secret is generated per instance in `/tmp`) |
| `AURUM_SEED_PASSWORD` | optional | Password for the seeded team accounts on first boot |
| `COOKIE_SECURE=1` / `TRUST_PROXY=1` | automatic | Already set for you when `VERCEL=1` |

**Storage caveat:** serverless instances have no persistent disk, so the
SQLite file lives in `/tmp` — data written in one instance is lost on cold
start. Login, dashboard and all features work; for durable shared data,
point `DB_FILE` at a volume or swap `server/db/connection.js` for a hosted
SQLite/Postgres driver (repositories keep the rest of the app unchanged).

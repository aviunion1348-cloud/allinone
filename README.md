# Aurum Ops — Pipeline & Agile Command Center

**Black/gold glass + neomorphism internal tool** for running the full client lifecycle —
from *first technical consultation* to *handover & maintenance* — with strict,
machine-enforced **turnover SLAs** transcribed from the team's Excalidraw pipeline board.

> The Excalidraw source of truth (`#json=_z6CsPYBItOKkslJ_wN30,…`) is fetched,
> **AES-128-GCM decrypted and committed by CI** into [`docs/pipeline.md`](docs/pipeline.md)
> (human-readable) + [`docs/pipeline.excalidraw.json`](docs/pipeline.excalidraw.json) (full scene).

---

## Quick start

```bash
npm install
npm start            # http://localhost:4100
```

Demo login: **`avi@aurum.internal` / `aurum-2026`**
(other seeded roles: `hoE@`, `cto@`, `agrim@`, `aryan@`, … same password)

| Script | Purpose |
| --- | --- |
| `npm start` | Boot server (auto-migrates + seeds on empty DB) |
| `npm run dev` | `--watch` mode |
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
```

The smoke test boots the SPA modules in jsdom, drives login, opens task/create
modals, and asserts **zero runtime errors** across every route.

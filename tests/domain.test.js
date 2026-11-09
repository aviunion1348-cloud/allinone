/** Domain unit tests — AI scoring + SLA state machine. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";

/* Pure-logic tests that don't need a DB: replicate the formulas under test
   by importing the module with an in-memory database. */

process.env.DB_FILE = ":memory:";
process.env.SEED_ON_EMPTY = "0";
process.env.LOG_LEVEL = "error";

const { scoreTask, buildContext, DEFAULT_WEIGHTS, getWeights } = await import(
  "../server/domain/ai.js"
);
const { slaState, SLA_POLICIES } = await import("../server/domain/sla.js");

// ensure schema exists for getWeights() (DB_FILE=:memory:)
const { migrate } = await import("../server/db/migrate.js");
migrate();

const HOUR = 3600_000;
const DAY = 24 * HOUR;

test("SLA policies transcribed from the pipeline document", () => {
  const byKey = Object.fromEntries(SLA_POLICIES.map((p) => [p.key, p]));
  assert.equal(byKey.plan_delta.hours, 72, "consultation → plan ≤ 3 days");
  assert.equal(byKey.plan_response.hours, 32, "plan response ≤ 12–32h");
  assert.equal(byKey.module_dev.hours, 24, "module turnover ≤ 1 day");
  assert.equal(byKey.milestone.hours, 168, "milestone ≤ 1 week");
  assert.equal(byKey.qa_report.hours, 12, "QA report ≤ 12 hours");
  assert.equal(byKey.ship_after_demo.hours, 120, "ship after demo ≤ 5 days");
  assert.equal(byKey.exec_summary.hours, 48, "exec summary ≥ 2 days before ship");
  assert.equal(byKey.edge_cases.value, 3500, "≥ 3500 edge cases before ship");
});

test("slaState classifies remaining time", () => {
  const now = Date.now();
  assert.equal(slaState(now - HOUR, now).state, "breached");
  assert.equal(slaState(now + 2 * HOUR, now).state, "critical");
  assert.equal(slaState(now + 12 * HOUR, now).state, "warning");
  assert.equal(slaState(now + 3 * DAY, now).state, "ok");
  assert.equal(slaState(null, now).state, "none");
  assert.match(slaState(now - 2 * DAY, now).label, /over$/);
});

test("weights default sum to ~1", () => {
  const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum}`);
});

function fakeTask(overrides = {}) {
  return {
    id: 1,
    title: "t",
    status: "todo",
    priority: "medium",
    type: "feature",
    estimate_hours: 4,
    due_at: null,
    created_at: Date.now() - HOUR,
    assignee_id: null,
    project_priority: "medium",
    phase_due_at: null,
    ...overrides,
  };
}

function fakeCtx(overrides = {}) {
  return {
    now: Date.now(),
    blockersOf: new Map(),
    openPerUser: new Map(),
    capacity: new Map(),
    ...overrides,
  };
}

test("critical + overdue task outscores low priority someday-task", () => {
  const ctx = fakeCtx();
  const hot = scoreTask(
    fakeTask({ priority: "critical", due_at: ctx.now - HOUR }),
    ctx,
    DEFAULT_WEIGHTS,
  );
  const cold = scoreTask(
    fakeTask({ priority: "low", due_at: ctx.now + 10 * DAY }),
    ctx,
    DEFAULT_WEIGHTS,
  );
  assert.ok(hot.score > cold.score, `${hot.score} !> ${cold.score}`);
  assert.ok(hot.score >= 60, `hot score ${hot.score}`);
});

test("blocking leverage raises score when dependents are open", () => {
  const ctx = fakeCtx();
  const blockersOf = new Map([[1, [{ id: 9, status: "todo" }]]]);
  const blockingCtx = fakeCtx({ blockersOf });
  const alone = scoreTask(fakeTask(), ctx, DEFAULT_WEIGHTS);
  const blocker = scoreTask(fakeTask(), blockingCtx, DEFAULT_WEIGHTS);
  assert.ok(blocker.score > alone.score, "blocker should rank higher");
  const blockingFactor = blocker.factors.find((f) => f.key === "blocking");
  assert.match(blockingFactor.label, /Blocks 1/);
});

test("phase SLA breach dominates slaRisk factor", () => {
  const ctx = fakeCtx();
  const breached = scoreTask(
    fakeTask({ phase_due_at: ctx.now - 2 * HOUR }),
    ctx,
    DEFAULT_WEIGHTS,
  );
  const safe = scoreTask(
    fakeTask({ phase_due_at: ctx.now + 5 * DAY }),
    ctx,
    DEFAULT_WEIGHTS,
  );
  const b = breached.factors.find((f) => f.key === "slaRisk");
  const s = safe.factors.find((f) => f.key === "slaRisk");
  assert.equal(b.raw, 100);
  assert.ok(s.raw < b.raw);
});

test("score is bounded 0..100 and factors explain the sum", () => {
  const ctx = fakeCtx();
  const t = fakeTask({
    priority: "critical",
    due_at: ctx.now - DAY,
    phase_due_at: ctx.now - HOUR,
    type: "qa",
    estimate_hours: 0.5,
    project_priority: "critical",
    assignee_id: 3,
  });
  const { score, factors } = scoreTask(t, ctx, DEFAULT_WEIGHTS);
  assert.ok(score >= 0 && score <= 100, `score ${score}`);
  const total = factors.reduce((a, f) => a + f.contribution, 0);
  assert.ok(Math.abs(total - score) < 0.5, "score equals weighted contributions");
  for (const f of factors) {
    assert.ok(f.raw >= 0 && f.raw <= 100, `${f.key} raw in range`);
    assert.ok(f.contribution >= 0, `${f.key} contribution ≥ 0`);
  }
});

test("effort factor favours quick wins", () => {
  const ctx = fakeCtx();
  const quick = scoreTask(fakeTask({ estimate_hours: 1 }), ctx, DEFAULT_WEIGHTS);
  const heavy = scoreTask(fakeTask({ estimate_hours: 40 }), ctx, DEFAULT_WEIGHTS);
  const q = quick.factors.find((f) => f.key === "effort");
  const h = heavy.factors.find((f) => f.key === "effort");
  assert.ok(q.raw > h.raw, `${q.raw} !> ${h.raw}`);
});

test("getWeights returns defaults when settings empty", () => {
  const w = getWeights();
  assert.equal(Object.keys(w).length, Object.keys(DEFAULT_WEIGHTS).length);
});

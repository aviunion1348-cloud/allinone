/**
 * Live-deployment probe — hits the production URL and reports status +
 * latency for static assets and every authenticated API surface.
 * Writes `deploy-probe-report.md` at the repo root (CI commits it back
 * so results are readable even where the Actions log host is blocked).
 *
 *   DEPLOY_URL=https://... node scripts/probe-deploy.mjs
 */
import { writeFileSync } from "node:fs";

const BASE = process.env.DEPLOY_URL || "https://allinone-two-nu.vercel.app";
const results = [];
const lines = [];
const say = (s = "") => { lines.push(s); console.log(s); };

async function hit(label, path, opts = {}) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}) },
      signal: AbortSignal.timeout(30_000),
    });
    const ms = Date.now() - t0;
    let body = "";
    try { body = await res.text(); } catch { /* no body */ }
    results.push({ label, status: res.status, ms, body });
    say(`${String(res.status).padEnd(4)} ${String(ms + "ms").padEnd(8)} ${label}`);
    return { res, body, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ label, status: "ERR", ms, body: String(err) });
    say(`ERR  ${ms}ms      ${label} — ${err}`);
    return { res: null, body: "", ms };
  }
}

async function main() {
  say(`# Deploy probe — ${BASE}`);
  say("");
  say(`_run at ${new Date().toISOString()}_`);
  say("");

  const idx = await hit("GET / (static shell)", "/");
  say(`     contains new copy: ${idx.body.includes("Admin access")}`);

  await hit("GET /css/app.css", "/css/app.css");
  await hit("GET /js/app.js", "/js/app.js");
  await hit("GET /js/views/dashboard.js", "/js/views/dashboard.js");

  await hit("GET /api/v1/health", "/api/v1/health");

  const login = await hit("POST /api/v1/auth/login", "/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "avi@aurum.internal", password: "aurum-2026" }),
  });
  let token = null;
  try { token = JSON.parse(login.body).token; } catch { /* ignore */ }
  if (!token) {
    say("");
    say("LOGIN FAILED — cannot probe authenticated routes");
    say("```");
    say(String(login.body).slice(0, 500));
    say("```");
    return 1;
  }
  say(`     token length: ${token.length}`);

  const auth = { authorization: `Bearer ${token}` };
  const bodies = [];
  const authed = [
    "GET /auth/me", "GET /dashboard", "GET /tasks/board", "GET /clients",
    "GET /projects", "GET /ai/ranks?limit=30", "GET /sla/health",
    "GET /playbook", "GET /roadmap", "GET /users/workload",
    "GET /pipeline/stages", "GET /activities?limit=10",
  ];
  for (const spec of authed) {
    const i = spec.indexOf(" ");
    const r = await hit(spec, `/api/v1${spec.slice(i + 1)}`, { method: spec.slice(0, i), headers: auth });
    bodies.push(`${spec} → ${String(r.body).slice(0, 140).replace(/\n/g, " ")}`);
  }

  say("");
  say("### response bodies (first 140 chars)");
  for (const b of bodies) say(`- ${b}`);

  let exitCode = 0;

  const dash = results.find((r) => r.label === "GET /dashboard");
  say("");
  if (dash && dash.status === 200) {
    try {
      const d = JSON.parse(dash.body);
      say(`dashboard shape: kpis=${Object.keys(d.kpis || {}).length} byStatus=${(d.byStatus || []).length} queue=${(d.priorityQueue || []).length} activities=${(d.activities || []).length} breaches=${d.kpis?.breached}`);
    } catch {
      say(`dashboard body is NOT JSON: ${String(dash.body).slice(0, 300)}`);
      exitCode = 1;
    }
  } else if (dash) {
    exitCode = 1;
    say(`dashboard FAILED: ${dash.status} ${String(dash.body).slice(0, 300)}`);
  }

  const failed = results.filter((r) => r.status !== 200);
  say("");
  say(`${results.length} probes, ${failed.length} non-200`);
  if (failed.length) exitCode = 1;
  return exitCode;
}

let code = 1;
try {
  code = await main();
} catch (err) {
  say(`PROBE CRASHED: ${err?.stack || err}`);
  code = 1;
}
writeFileSync("deploy-probe-report.md", lines.join("\n") + "\n");
process.exit(code);

/**
 * Live-deployment probe — hits the production URL and reports status +
 * latency for static assets and every authenticated API surface.
 * Run via the "Deploy probe" workflow (workflow_dispatch) or locally:
 *   DEPLOY_URL=https://... node scripts/probe-deploy.mjs
 */
const BASE = process.env.DEPLOY_URL || "https://allinone-two-nu.vercel.app";
const results = [];

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
    console.log(`${String(res.status).padEnd(4)} ${String(ms + "ms").padEnd(8)} ${label}`);
    return { res, body, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    results.push({ label, status: "ERR", ms, body: String(err) });
    console.log(`ERR  ${ms}ms      ${label} — ${err}`);
    return { res: null, body: "", ms };
  }
}

async function main() {
  console.log(`probing ${BASE}\n`);

  const idx = await hit("GET / (static shell)", "/");
  console.log(`     contains new copy: ${idx.body.includes("Admin access")}`);

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
    console.log("\nLOGIN FAILED — cannot probe authenticated routes");
    console.log(login.body.slice(0, 500));
    process.exitCode = 1;
    return;
  }
  console.log(`     token length: ${token.length}`);

  const auth = { authorization: `Bearer ${token}` };
  const authed = [
    "GET /auth/me", "GET /dashboard", "GET /tasks/board", "GET /clients",
    "GET /projects", "GET /ai/ranks?limit=30", "GET /sla/health",
    "GET /playbook", "GET /roadmap", "GET /users/workload",
    "GET /pipeline/stages", "GET /activities?limit=10",
  ];
  for (const spec of authed) {
    const [method, path] = [spec.slice(0, spec.indexOf(" ")), spec.slice(spec.indexOf(" ") + 1)];
    await hit(`${method} ${path}`, path, { method, headers: auth });
  }

  // shape check on the dashboard payload
  const dash = results.find((r) => r.label.includes("/dashboard"));
  if (dash && dash.status === 200) {
    try {
      const d = JSON.parse(dash.body);
      console.log(`\ndashboard shape: kpis=${Object.keys(d.kpis || {}).length} byStatus=${(d.byStatus || []).length} queue=${(d.priorityQueue || []).length} activities=${(d.activities || []).length}`);
    } catch {
      console.log(`\ndashboard body is NOT JSON: ${String(dash.body).slice(0, 200)}`);
      process.exitCode = 1;
    }
  } else if (dash) {
    process.exitCode = 1;
    console.log(`\ndashboard FAILED: ${dash.status} ${String(dash.body).slice(0, 300)}`);
  }

  const failed = results.filter((r) => r.status !== 200);
  console.log(`\n${results.length} probes, ${failed.length} non-200`);
  if (failed.length) process.exitCode = 1;
}

main();

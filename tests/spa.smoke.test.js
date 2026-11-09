/**
 * SPA smoke test — renders every view inside jsdom against the live API,
 * asserting no exceptions and key content presence.
 *
 * Run: node tests/spa.smoke.test.js   (server must be up on :4100)
 */
import { JSDOM } from "jsdom";

const BASE = process.env.BASE_URL || "http://localhost:4100";

/* ── boot DOM ─────────────────────────────────────────────────────── */
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="login" class="login-screen hidden">
    <form id="login-form"><input id="login-email"/><input id="login-password"/></form>
  </div>
  <div id="app" class="hidden">
    <aside class="sidebar">
      <div class="sidebar-foot"></div>
      <div class="nav-item" data-route="dashboard"></div>
      <div class="nav-item" data-route="board"></div>
      <div class="nav-item" data-route="pipeline"></div>
      <div class="nav-item" data-route="projects"></div>
      <div class="nav-item" data-route="roadmap"></div>
      <div class="nav-item" data-route="ai"></div>
      <div class="nav-item" data-route="team"></div>
    </aside>
    <div class="main">
      <div class="topbar"><div class="page-title" id="page-title"></div><div id="topbar-actions"></div></div>
      <main class="content" id="content"></main>
    </div>
  </div>
  <div class="modal-root" id="modal-root"><div class="modal-backdrop"></div><div class="modal" id="modal-box"></div></div>
  <div class="toast-root" id="toast-root"></div>
</body></html>`, {
  url: `${BASE}/`,
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
try {
  Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true });
} catch {
  /* node's navigator is read-only — jsdom shares enough of it */
}
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.localStorage = window.localStorage;

// fetch → live server (jsdom's own fetch doesn't do CORS-free relative URLs)
const realFetch = globalThis.fetch;
globalThis.fetch = (url, opts) => {
  const abs = String(url).startsWith("http") ? String(url) : `${BASE}${url}`;
  return realFetch(abs, { ...opts, headers: { ...(opts?.headers || {}) } });
};
window.fetch = globalThis.fetch;

/* ── helpers ──────────────────────────────────────────────────────── */
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); origError(...a); };
window.addEventListener("error", (e) => errors.push(`window.error: ${e.message}`));

function assert(cond, msg) {
  if (!cond) {
    console.log(`  ✗ FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 6000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* keep polling */ }
    await sleep(80);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/* ── self-boot: npm test works with no pre-started dev server ────── */
let ownServer = null;
let ownDbFile = null;
async function ensureServer() {
  try {
    const r = await realFetch(`${BASE}/api/v1/health`);
    if (r.ok) return; // external server already running (dev flow)
  } catch { /* down — boot one for this test run */ }
  // hermetic: never write fixtures or migrations into the dev data/ file
  if (!process.env.DB_FILE) {
    const path = await import("node:path");
    const os = await import("node:os");
    ownDbFile = path.join(os.tmpdir(), `aurum-smoke-${process.pid}.sqlite`);
    process.env.DB_FILE = ownDbFile;
  }
  const { createApp } = await import("../server/app.js");
  const { migrate } = await import("../server/db/migrate.js");
  const { seedIfEmpty } = await import("../server/db/seed.js");
  migrate();
  seedIfEmpty();
  const port = Number(new URL(BASE).port) || 4100;
  ownServer = await new Promise((resolve, reject) => {
    const s = createApp().listen(port, "0.0.0.0", () => resolve(s));
    s.once("error", reject);
  });
  console.log(`(test server booted on :${port}, db ${ownDbFile ?? "external"})`);
}

async function shutdown() {
  if (!ownServer) return;
  // keep-alive sockets from this process's own fetch would stall close()
  ownServer.closeAllConnections?.();
  await new Promise((r) => ownServer.close(r));
  const { closeDb } = await import("../server/db/connection.js");
  closeDb();
  if (ownDbFile) {
    const fs = await import("node:fs");
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(ownDbFile + suffix); } catch { /* already gone */ }
    }
  }
}

/* ── run ──────────────────────────────────────────────────────────── */
async function main() {
  await ensureServer();
  console.log("== health ==");
  const health = await (await realFetch(`${BASE}/api/v1/health`)).json();
  assert(health.ok === true, "API healthy");

  console.log("== login flow ==");
  const loginRes = await realFetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "avi@aurum.internal", password: "aurum-2026" }),
  });
  assert(loginRes.ok, "login 200");
  // use bearer token (same path the SPA uses when cookies are blocked)
  const loginBody = await loginRes.json();
  assert(typeof loginBody.token === "string" && loginBody.token.length > 40, "login returns bearer token");
  const authedFetch = (url, opts = {}) => {
    const abs = String(url).startsWith("http") ? String(url) : `${BASE}${url}`;
    return realFetch(abs, {
      ...opts,
      headers: { ...(opts.headers || {}), authorization: `Bearer ${loginBody.token}` },
    });
  };
  globalThis.fetch = authedFetch;
  window.fetch = authedFetch;

  console.log("== boot SPA modules ==");
  const { renderDashboard } = await import("../public/js/views/dashboard.js");
  const { renderBoard, openTask, openCreateTask } = await import("../public/js/views/board.js");
  const { renderPipeline, openCreateClient } = await import("../public/js/views/pipeline.js");
  const { renderProjects, renderProjectDetail, openCreateProject } = await import("../public/js/views/projects.js");
  const { renderRoadmap } = await import("../public/js/views/roadmap.js");
  const { renderAI } = await import("../public/js/views/ai.js");
  const { renderTeam } = await import("../public/js/views/team.js");
  const { api } = await import("../public/js/api.js");
  assert(true, "all view modules imported");

  /* Fixtures created through the real API — proves CRUD works on an
     empty workspace and gives every view something to render. */
  console.log("== fixtures via API ==");
  const fxClient = await api.post("/clients", {
    name: "Smoke Contact", company: "SmokeCo", stage: "technical_consultation",
  });
  const fxProject = await api.post("/projects", {
    code: "SMOKE-1", name: "Smoke fixture project", client_id: fxClient.id,
  });
  const fxTask = await api.post("/tasks", {
    project_id: fxProject.id, title: "Smoke fixture task",
    type: "chore", status: "todo", priority: "medium", estimate_hours: 2,
  });
  assert(
    Boolean(fxClient?.id && fxProject?.id && fxTask?.id),
    "client + project + task created via API",
  );

  // cache like app.js does
  const [users, projects, clients] = await Promise.all([api.users(), api.projects(), api.clients()]);
  const ctx = {
    user: { role: "admin", name: "Avi" },
    cache: { users, projects, clients },
    navigate: () => {},
    refreshCurrent: () => {},
  };
  assert(users.length > 0 && projects.length > 0 && clients.length > 0, "cache populated");

  const content = document.getElementById("content");
  const text = () => content.textContent;

  console.log("== dashboard ==");
  await renderDashboard(ctx);
  await sleep(150);
  assert(text().includes("Active projects"), "KPI present");
  assert(text().includes("Turnover compliance"), "compliance KPI present");
  assert(text().includes("AI priority queue"), "AI queue present");
  assert(document.querySelectorAll(".kpi").length >= 6, "≥6 KPI cards");
  assert(document.querySelectorAll(".spark-bar, .empty").length > 0, "chart rendered");

  console.log("== board ==");
  await renderBoard(ctx);
  await waitFor(() => document.querySelectorAll(".task-card").length > 0, 6000, "task cards");
  const cardCount = document.querySelectorAll(".task-card").length;
  assert(cardCount >= 1, `task cards rendered (${cardCount})`);
  assert(document.querySelectorAll(".column").length === 6, "6 kanban columns");
  assert(document.querySelector(".column[data-col='in_progress']") != null, "in_progress column");

  console.log("== task modal ==");
  const firstTask = await api.get("/tasks");
  await openTask(firstTask[0].id, ctx);
  await waitFor(() => document.getElementById("modal-root").classList.contains("open"), 4000, "modal open");
  assert(document.getElementById("modal-box").textContent.includes(firstTask[0].title.slice(0, 12)), "modal shows title");
  const hasFactors = document.querySelectorAll(".factor").length > 0;
  assert(hasFactors, "AI factor breakdown rendered");
  document.getElementById("modal-root").classList.remove("open");

  console.log("== create task modal ==");
  openCreateTask(ctx);
  await waitFor(() => document.getElementById("modal-root").classList.contains("open"), 3000, "create modal");
  assert(document.getElementById("modal-box").querySelectorAll("select").length >= 4, "create form fields");
  document.getElementById("modal-root").classList.remove("open");

  console.log("== pipeline ==");
  await renderPipeline(ctx);
  await sleep(200);
  assert(document.querySelectorAll(".stage").length >= 9, "stage columns");
  assert(document.querySelectorAll(".client-card").length >= 1, "client cards");
  assert(text().includes("Turnover SLA policies"), "SLA policy table");
  assert(text().includes("Persona playbook"), "persona playbook panel");
  assert(text().includes("Dreamer") && text().includes("Enthusiast") && text().includes("Pessimistic"),
    "all three personas rendered");
  assert(text().includes("Market as"), "market-as positioning");
  assert(text().includes("Delivery roles"), "delivery roles matrix");

  console.log("== projects ==");
  await renderProjects(ctx);
  await sleep(150);
  assert(document.querySelectorAll(".card").length >= 1, "project cards");
  await renderProjectDetail(fxProject.id, ctx);
  await sleep(150);
  assert(document.querySelectorAll(".phase").length === 6, "6 delivery phases");
  assert(text().includes("Spec & architecture"), "spec phase present");

  console.log("== roadmap ==");
  await renderRoadmap(ctx);
  await waitFor(() => text().includes("Excalidraw") || text().includes("pipeline"), 5000, "roadmap doc");
  assert(text().includes("Master pipeline") || text().includes("Pipeline document"), "roadmap section");

  console.log("== ai ==");
  await renderAI(ctx);
  await sleep(200);
  assert(text().includes("Priority queue"), "rank queue");
  assert(document.querySelectorAll("tbody tr").length >= 1, "ranked rows");
  assert(text().includes("Model weights"), "weights panel");

  console.log("== team ==");
  await renderTeam(ctx);
  await sleep(150);
  assert(text().includes("Team workload"), "workload panel");
  assert(text().includes("SLA policy book"), "policy book");

  console.log("== modals & helpers ==");
  const { toast, confirmDialog, donut, renderMarkdown, closeModal } = await import("../public/js/ui.js");
  document.querySelector(".modal-backdrop")?.addEventListener("click", closeModal);
  toast("smoke toast");
  await sleep(50);
  assert(document.querySelectorAll(".toast").length >= 1, "toast renders");
  const d = donut(87);
  assert(d.querySelector("text") != null, "donut chart svg");
  const md = renderMarkdown("# Hi\n\n- one\n- two\n\n**bold** and `code`");
  assert(md.querySelector("h1") && md.querySelector("li") && md.querySelector("strong"), "markdown renderer");
  const confirmedP = confirmDialog("T", "msg?");
  await sleep(80);
  document.querySelector(".modal-backdrop")?.click();
  const confirmed = await confirmedP;
  assert(confirmed === false, "confirmDialog resolves false on cancel (backdrop)");

  console.log("== cleanup fixtures ==");
  await api.deleteTask(fxTask.id);
  await api.deleteProject(fxProject.id);
  await api.deleteClient(fxClient.id);
  const after = await api.get("/tasks");
  assert(!after.some((t) => t.title === "Smoke fixture task"), "fixtures cleaned up");

  console.log("== auth guard ==");
  const bare = await realFetch(`${BASE}/api/v1/dashboard`);
  assert(bare.status === 401, "unauthenticated → 401");

  const realErrors = errors.filter((e) =>
    !e.includes("Could not parse CSS") &&      // jsdom css limitations
    !e.includes("Not implemented: navigation") &&
    !e.includes("Error: Not implemented") &&
    !e.includes("ExperimentalWarning") &&      // node:sqlite warning (self-boot)
    !e.includes("trace-warnings"));
  assert(realErrors.length === 0, `no runtime errors (${realErrors.length})`);
  if (realErrors.length) console.log(realErrors.slice(0, 5).join("\n"));

  console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nSMOKE TEST PASSED ✓");
  await shutdown();
}

main().catch(async (err) => {
  console.error("SMOKE TEST CRASH:", err);
  await shutdown().catch(() => {});
  process.exit(1);
});

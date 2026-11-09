/**
 * Full-boot E2E — executes the REAL public/index.html with the REAL
 * public/js/app.js exactly as a browser would: boot → login form →
 * enterApp → router → every view. Catches DOM-structure drift between
 * index.html and app.js (e.g. a missing .sidebar-foot) that the
 * view-level smoke test — which uses its own fixture HTML — cannot see.
 *
 * Run: node tests/boot.e2e.test.js   (self-booting, hermetic DB)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "http://localhost:4100";
const html = readFileSync(path.join(root, "public", "index.html"), "utf8");

/* ── self-boot (hermetic) ────────────────────────────────────────── */
let ownServer = null;
let ownDbFile = null;
async function ensureServer() {
  try {
    const r = await fetch(`${BASE}/api/v1/health`);
    if (r.ok) return;
  } catch { /* boot one */ }
  if (!process.env.DB_FILE) {
    const p = await import("node:path");
    const os = await import("node:os");
    ownDbFile = p.join(os.tmpdir(), `aurum-boot-${process.pid}.sqlite`);
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
  console.log(`(boot test server on :${port})`);
}

async function shutdown() {
  if (!ownServer) return;
  ownServer.closeAllConnections?.();
  await new Promise((r) => ownServer.close(r));
  const { closeDb } = await import("../server/db/connection.js");
  closeDb();
  if (ownDbFile) {
    const fs = await import("node:fs");
    for (const s of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(ownDbFile + s); } catch { /* gone */ }
    }
  }
}

/* ── DOM from the REAL index.html ────────────────────────────────── */
const dom = new JSDOM(html, { url: `${BASE}/`, pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
try {
  Object.defineProperty(global, "navigator", { value: window.navigator, configurable: true });
} catch { /* read-only in node */ }
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.getComputedStyle = window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.localStorage = window.localStorage;
// browsers expose these as bare globals; Node does not
global.location = window.location;
global.history = window.history;
global.sessionStorage = window.sessionStorage;

const realFetch = globalThis.fetch;
const fetchShim = (url, opts) => {
  const abs = String(url).startsWith("http") ? String(url) : `${BASE}${url}`;
  return realFetch(abs, { ...opts, headers: { ...(opts?.headers || {}) } });
};
globalThis.fetch = fetchShim;
window.fetch = fetchShim;

/* errors → captured */
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(" ")); origError(...a); };
window.addEventListener("error", (e) => errors.push(`window.error: ${e.message}`));
window.addEventListener("unhandledrejection", (e) =>
  errors.push(`unhandledrejection: ${e.reason?.message || e.reason}`));

function assert(cond, msg) {
  if (!cond) { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; }
  else console.log(`  ✓ ${msg}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(80);
  }
  throw new Error(`timeout waiting for ${label}`);
}
const $ = (sel) => document.querySelector(sel);
const text = () => document.getElementById("content")?.textContent || "";

/* keep bgRefresh's interval from holding the process open */
const origInterval = globalThis.setInterval;
globalThis.setInterval = (fn, ms, ...a) => {
  const t = origInterval(fn, ms, ...a);
  t.unref?.();
  return t;
};

async function main() {
  await ensureServer();

  console.log("== boot (real app.js) ==");
  await import("../public/js/app.js");
  await waitFor(() => !$("#login").classList.contains("hidden"), 8000, "login screen");
  assert(true, "boot reached login (api.me 401 → showLogin)");

  console.log("== login through the real form ==");
  $("#login-email").value = "avi@aurum.internal";
  $("#login-password").value = "aurum-2026";
  $("#login-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => $("#app") && !$("#app").classList.contains("hidden"), 8000, "app revealed");
  let lastToast = "";
  // wait for REAL dashboard content — the skeleton also has .kpi elements
  await waitFor(() => {
    const t = document.getElementById("toast-root")?.textContent;
    if (t) lastToast = t;
    return (document.getElementById("content")?.textContent || "").includes("Active projects");
  }, 8000, "dashboard content").catch((e) => {
    if (lastToast) errors.push(`toast-captured: ${lastToast}`);
    throw e;
  });
  assert(true, "login → app revealed → dashboard rendered");

  console.log("== chrome that was blank before ==");
  const foot = $(".sidebar-foot");
  assert(foot != null, ".sidebar-foot exists in real index.html");
  assert(foot && foot.textContent.includes("Avi"), "user chip rendered in sidebar footer");
  assert(foot && foot.textContent.includes("Sign out"), "sign-out action rendered");
  assert($("#topbar-actions").textContent.includes("SLA ENFORCED"), "topbar SLA chip rendered");
  assert(text().includes("Active projects"), "dashboard KPI content present");
  assert($("#nav-board-count") != null, "nav badge element present");

  console.log("== every route renders in the real shell ==");
  const routes = [
    ["board", () => document.querySelectorAll(".column").length === 6, "kanban columns"],
    ["pipeline", () => document.querySelectorAll(".stage").length >= 9, "pipeline stages"],
    ["clocks", () => text().includes("Live clocks"), "turnover clocks"],
    ["planning", () => text().includes("Weekly capacity"), "planning & capacity"],
    ["qa", () => text().includes("Edge-case matrix"), "QA centre"],
    ["releases", () => text().includes("Release train"), "releases"],
    ["clients", () => text().includes("Accounts") || text().includes("No clients yet"), "clients"],
    ["partner", () => text().includes("one account") || text().includes("No clients yet"), "partner console"],
    ["projects", () => text().includes("No projects") || document.querySelectorAll(".card").length >= 1, "projects view"],
    ["roadmap", () => text().includes("Excalidraw") || text().includes("pipeline"), "roadmap doc"],
    ["ai", () => text().includes("Priority queue"), "AI queue"],
    ["team", () => text().includes("Team workload"), "team workload"],
    ["dashboard", () => document.querySelectorAll(".kpi").length >= 6, "back to dashboard"],
  ];
  for (const [route, check, label] of routes) {
    window.location.hash = `#/${route}`; // jsdom fires hashchange natively
    await waitFor(check, 8000, label);
    assert(true, `route /${route} → ${label}`);
  }

  console.log("== zero runtime errors ==");
  const real = errors.filter((e) =>
    !e.includes("Could not parse CSS") &&
    !e.includes("Not implemented: navigation") &&
    !e.includes("Error: Not implemented") &&
    !e.includes("ExperimentalWarning") &&
    !e.includes("trace-warnings"));
  assert(real.length === 0, `no runtime errors (${real.length})`);
  if (real.length) console.log(real.slice(0, 5).join("\n"));

  console.log(process.exitCode ? "\nBOOT E2E FAILED" : "\nBOOT E2E PASSED ✓");
  await shutdown();
}

main().catch(async (err) => {
  console.error("BOOT E2E CRASH:", err);
  try {
    console.error("captured console.error/window errors:");
    for (const e of errors.slice(0, 10)) console.error("  •", e);
    const c = document.getElementById("content");
    console.error("#content children:", c?.childElementCount, "html:", String(c?.innerHTML).slice(0, 400));
    console.error("#app hidden:", document.getElementById("app")?.classList.contains("hidden"));
    console.error("hash:", window.location.hash);
    console.error("topbar:", document.getElementById("topbar-actions")?.textContent);
    console.error("toasts:", document.getElementById("toast-root")?.textContent);
  } catch { /* ignore */ }
  await shutdown().catch(() => {});
  process.exit(1);
});

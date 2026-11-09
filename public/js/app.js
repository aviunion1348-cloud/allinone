/** Aurum Ops SPA — auth gate, hash router, cache, background refresh. */
import { api, auth } from "./api.js";
import { $, el, mount, clear, toast, closeModal } from "./ui.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderBoard } from "./views/board.js";
import { renderPipeline } from "./views/pipeline.js";
import { renderProjects, renderProjectDetail } from "./views/projects.js";
import { renderRoadmap } from "./views/roadmap.js";
import { renderAI } from "./views/ai.js";
import { renderTeam } from "./views/team.js";

const ROUTES = {
  dashboard: { title: "Dashboard", render: (ctx) => renderDashboard(ctx) },
  board: { title: "Agile <em>Board</em>", render: (ctx) => renderBoard(ctx) },
  pipeline: { title: "Client <em>Pipeline</em>", render: (ctx) => renderPipeline(ctx) },
  projects: { title: "Projects", render: (ctx) => renderProjects(ctx) },
  roadmap: { title: "Roadmap & <em>Excalidraw</em>", render: (ctx) => renderRoadmap(ctx) },
  ai: { title: "AI <em>Priorities</em>", render: (ctx) => renderAI(ctx) },
  team: { title: "Team & <em>SLA</em>", render: (ctx) => renderTeam(ctx) },
};

const state = {
  user: null,
  route: "dashboard",
  param: null,
  cache: { users: [], projects: [], clients: [] },
};

const ctx = {
  get user() { return state.user; },
  get cache() { return state.cache; },
  navigate,
  refreshCurrent: () => render(),
};

/* ── auth ───────────────────────────────────────────────────────── */

async function boot() {
  try {
    const { user } = await api.me();
    state.user = user;
    await enterApp();
  } catch {
    auth.clear();
    showLogin();
  }
}

function showLogin() {
  $("#login").classList.remove("hidden");
  $("#app").classList.add("hidden");
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    try {
      const { user, token } = await api.login(email, password);
      auth.save(token); // bearer fallback when cookies are blocked (iframes)
      state.user = user;
      toast(`Welcome back, ${user.name}`, "ok");
      $("#login").classList.add("hidden");
      await enterApp();
    } catch (err) {
      toast(err.message || "Login failed", "err");
    }
  };
}

async function enterApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  await refreshCache();
  renderUserChip();
  window.addEventListener("hashchange", onHash);
  onHash();
  setInterval(bgRefresh, 20_000);
}

async function refreshCache() {
  try {
    const [users, projects, clients] = await Promise.all([
      api.users(), api.projects(), api.clients(),
    ]);
    state.cache = { users, projects, clients };
  } catch {
    /* non-fatal */
  }
}

function renderUserChip() {
  const foot = $(".sidebar-foot");
  const u = state.user;
  clear(foot);
  foot.append(
    el("div.nav-item", { style: "cursor:default", onclick: () => {} },
      el("span.avatar", {
        style: `background:linear-gradient(135deg, ${u.color || "#e8b923"}, #8a6d1f)`,
      }, (u.name || "?")[0].toUpperCase()),
      el("div.user-meta", {},
        el("div.user-name", {}, u.name),
        el("div.user-role", {}, `${u.role} · ${u.title || ""}`),
      ),
    ),
    el("div.nav-item", {
      onclick: async () => {
        try { await api.logout(); } catch { /* ignore */ }
        auth.clear();
        location.hash = "";
        location.reload();
      },
      style: "margin-top:6px;color:var(--text-low)",
    }, "⇄ Sign out"),
  );
}

/* ── router ─────────────────────────────────────────────────────── */

function parseHash() {
  const raw = (location.hash || "#/dashboard").replace(/^#\/?/, "");
  const [route, param] = raw.split("/");
  return { route: ROUTES[route] ? route : "dashboard", param: param ? Number(param) || param : null };
}

function navigate(route, param) {
  location.hash = `#/${route}${param != null ? `/${param}` : ""}`;
}

function onHash() {
  const { route, param } = parseHash();
  state.route = route;
  state.param = param;
  render();
}

async function render() {
  closeModal();
  const route = ROUTES[state.route];

  // nav highlight
  for (const item of document.querySelectorAll(".nav-item[data-route]")) {
    item.classList.toggle("active", item.dataset.route === state.route);
  }

  $("#page-title").innerHTML = route.title;

  // topbar contextual actions
  const actions = clear($("#topbar-actions"));
  actions.append(
    el("span.chip.gold", { title: "Turnover policy active" }, "SLA ENFORCED"),
    el("span", {
      style: "font-size:11.5px;color:var(--text-low)",
      title: "Local time",
    }, new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
  );

  try {
    if (state.route === "projects" && state.param) {
      $("#page-title").innerHTML = "Project <em>Detail</em>";
      await renderProjectDetail(state.param, ctx);
    } else {
      await route.render(ctx);
    }
  } catch (err) {
    console.error(err);
    mount($("#content"), el("div.card", {},
      el("div", { style: "color:var(--danger);font-weight:700;margin-bottom:8px" }, "View failed to load"),
      el("div", { style: "color:var(--text-mid)" }, err.message || String(err)),
    ));
  }
}

/* ── background refresh (keeps SLA clocks & ranks honest) ───────── */

let refreshing = false;
async function bgRefresh() {
  if (refreshing || document.hidden) return;
  // never yank the UI out from under the user
  if (document.querySelector(".modal-root.open")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const focusedCard = document.activeElement?.closest?.(".task-card, .client-card");
  if (focusedCard) return;
  refreshing = true;
  try {
    if (["dashboard", "pipeline", "team"].includes(state.route)) {
      await render();
    } else if (state.route === "board") {
      // light refresh: only the board itself, keep scroll position
      const scroller = document.querySelector(".content");
      const top = scroller?.scrollTop ?? 0;
      await render();
      const after = document.querySelector(".content");
      if (after) after.scrollTop = top;
    }
  } catch {
    /* ignore transient */
  } finally {
    refreshing = false;
  }
}

/* ── global nav wiring ──────────────────────────────────────────── */

for (const item of document.querySelectorAll(".nav-item[data-route]")) {
  item.addEventListener("click", () => navigate(item.dataset.route));
}
document.querySelector(".modal-backdrop")?.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

boot();

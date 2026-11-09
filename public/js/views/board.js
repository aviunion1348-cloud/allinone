/** Agile board — kanban with drag & drop, filters, task detail modal. */
import { api } from "../api.js";
import {
  $, el, mount, clear, fmt, avatar, priorityChip, slaChip, typeChip,
  STATUS_LABELS, STAGE_LABELS, toast, openModal, closeModal, confirmDialog,
  sectionTitle, emptyState,
} from "../ui.js";

const COLUMNS = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
const COLUMN_ACCENT = {
  backlog: "var(--text-low)", todo: "var(--info)", in_progress: "var(--gold-2)",
  in_review: "#c792ea", blocked: "var(--danger)", done: "var(--ok)",
};

const filters = { project_id: "", assignee_id: "", priority: "", q: "" };
let ctxRef = null;

export async function renderBoard(ctx) {
  ctxRef = ctx;
  const content = $("#content");

  const top = el("div", {},
    el("div.filters", {},
      el("div.search-box", {},
        el("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
          el("circle", { cx: "11", cy: "11", r: "7" }), el("path", { d: "M20 20l-3.5-3.5" })),
        el("input.input", {
          placeholder: "Search tasks…", value: filters.q,
          oninput: (e) => { filters.q = e.target.value; debounceReload(); },
        }),
      ),
      el("select.input", {
        onchange: (e) => { filters.project_id = e.target.value; reload(); },
      },
        el("option", { value: "" }, "All projects"),
        ...(ctx.cache.projects || []).map((p) =>
          el("option", { value: p.id, selected: String(p.id) === String(filters.project_id) }, `${p.code} — ${p.name}`)),
      ),
      el("select.input", {
        onchange: (e) => { filters.assignee_id = e.target.value; reload(); },
      },
        el("option", { value: "" }, "All assignees"),
        ...(ctx.cache.users || []).map((u) =>
          el("option", { value: u.id, selected: String(u.id) === String(filters.assignee_id) }, u.name)),
      ),
      el("select.input", {
        onchange: (e) => { filters.priority = e.target.value; reload(); },
      },
        el("option", { value: "" }, "Any priority"),
        ...["critical", "high", "medium", "low"].map((p) =>
          el("option", { value: p, selected: p === filters.priority }, p)),
      ),
      (filters.q || filters.project_id || filters.assignee_id || filters.priority) &&
        el("button.btn.btn.btn-ghost.sm", {
          onclick: () => {
            filters.q = ""; filters.project_id = ""; filters.assignee_id = ""; filters.priority = "";
            reload();
          },
        }, "✕ Clear"),
      el("div.spacer"),
      el("button.btn.btn.btn-gold", { onclick: () => openCreateTask(ctx) }, "+ New task"),
      el("button.btn.btn", { onclick: () => reload(true) }, "↻ Refresh"),
    ),
    el("div.board", { id: "board" }, el("div.card.skeleton", { style: "height:400px;grid-column:1/-1" })),
  );
  mount(content, top);
  await loadBoard();
}

let reloadTimer = null;
function debounceReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(reload, 260);
}

async function reload(hard = false) {
  if (hard) toast("Recomputing AI ranks…", "ok", 1400);
  await loadBoard();
}

async function loadBoard() {
  const boardEl = $("#board");
  if (!boardEl) return;
  let board;
  try {
    board = await api.board(filters.project_id || undefined);
  } catch (err) {
    mount(boardEl, el("div.card", {}, `Failed to load board: ${err.message}`));
    return;
  }

  // apply client-side filters
  const projects = Object.fromEntries((ctxRef.cache.projects || []).map((p) => [p.id, p]));
  const match = (t) => {
    if (filters.assignee_id && String(t.assignee_id) !== filters.assignee_id) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.q) {
      const hay = `${t.title} ${t.description || ""} ${t.project_code || ""}`.toLowerCase();
      if (!hay.includes(filters.q.toLowerCase())) return false;
    }
    return true;
  };

  const total = COLUMNS.reduce((n, c) => n + (board[c] || []).filter(match).length, 0);
  const badge = $("#nav-board-count");
  if (badge) badge.textContent = String(Object.values(board).flat().filter((t) => t.status !== "done").length);

  if (!total && (filters.q || filters.assignee_id || filters.priority)) {
    mount(boardEl, el("div.card", { style: "grid-column:1/-1" },
      emptyState("🔍", "No tasks match the current filters")));
    return;
  }

  mount(boardEl, COLUMNS.map((col) => {
    const tasks = (board[col] || []).filter(match);
    const accent = COLUMN_ACCENT[col];
    return el("div.column", { dataset: { col } },
      el("div.column-head", {},
        el("span.dot", { style: `background:${accent};box-shadow:0 0 8px ${accent}` }),
        el("span.name", {}, STATUS_LABELS[col]),
        el("span.count", {}, String(tasks.length)),
      ),
      el("div.column-body", { dataset: { col } },
        tasks.length
          ? tasks.map((t) => taskCard(t, projects[t.project_id]))
          : el("div.column-empty", {}, "Drop tasks here"),
      ),
    );
  }));

  wireDnd();
}

function taskCard(t, project) {
  const card = el("div.task-card", {
    draggable: "true",
    dataset: { id: t.id },
    onclick: () => openTask(t.id, ctxRef),
  },
    el("div.row", { style: "gap:7px" },
      el("span.tid", {}, project ? project.code : `#${t.id}`),
      t.blocked_by_count > 0 &&
        el("span.chip.p-critical", { title: "Blocked by unfinished dependencies" }, `⛓ ${t.blocked_by_count}`),
      el("div.spacer"),
      slaChip(t.due_at),
    ),
    el("div.ttitle", {}, t.title),
    el("div.tmeta", {},
      priorityChip(t.priority),
      typeChip(t.type),
      el("div.spacer"),
      t.rank_score > 0 ? el("span.tscore", { title: "AI score" }, `◆ ${t.rank_score}`) : null,
      t.assignee_name ? avatar(t.assignee_name, t.assignee_color, "xs") : el("span", { style: "color:var(--text-low);font-size:11px" }, "unassigned"),
    ),
    (t.labels && t.labels.length) &&
      el("div.tlabels", {}, t.labels.slice(0, 4).map((l) => el("span.tlabel", {}, l))),
  );
  return card;
}

function wireDnd() {
  let dragging = null;

  for (const card of document.querySelectorAll(".task-card")) {
    card.addEventListener("dragstart", (e) => {
      dragging = card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.id);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      document.querySelectorAll(".column").forEach((c) => c.classList.remove("drag-over"));
      dragging = null;
    });
  }

  for (const zone of document.querySelectorAll(".column, .column-body")) {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const col = zone.closest(".column");
      if (col) col.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", (e) => {
      const col = zone.closest(".column");
      if (col && !col.contains(e.relatedTarget)) col.classList.remove("drag-over");
    });
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      const col = zone.closest(".column");
      if (col) col.classList.remove("drag-over");
      const id = Number(e.dataTransfer.getData("text/plain"));
      const status = (col || zone).dataset.col || zone.dataset.col;
      if (!id || !status) return;

      const card = document.querySelector(`.task-card[data-id="${id}"]`);
      const before = card ? card.closest(".column")?.dataset.col : null;
      if (before === status) return;

      // optimistic move
      if (card) {
        card.style.opacity = "0.4";
        card.style.pointerEvents = "none";
      }
      try {
        await api.moveTask(id, status);
        await loadBoard();
        toast(`Moved to ${STATUS_LABELS[status]}`, "ok", 1800);
      } catch (err) {
        toast(err.message, "err");
        await loadBoard();
      }
    });
  }
}

/* ── task detail modal ──────────────────────────────────────────── */

export async function openTask(id, ctx) {
  let task;
  try {
    task = await api.task(id);
  } catch (err) {
    toast(err.message, "err");
    return;
  }
  let score = null;
  try {
    score = await api.aiScore(id);
  } catch { /* optional */ }

  const suggestions = task.assignee_id ? [] : await api.assigneeSuggestions(id).catch(() => []);

  const project = (ctx.cache.projects || []).find((p) => p.id === task.project_id);
  const users = ctx.cache.users || [];

  const statusSelect = el("select.input", {
    onchange: async (e) => {
      try {
        await api.moveTask(task.id, e.target.value);
        toast("Status updated", "ok", 1600);
        closeModal();
        ctx.refreshCurrent();
      } catch (err) { toast(err.message, "err"); }
    },
  }, COLUMNS.map((c) => el("option", { value: c, selected: c === task.status }, STATUS_LABELS[c])));

  const assigneeSelect = el("select.input", {
    onchange: async (e) => {
      try {
        await api.updateTask(task.id, { assignee_id: e.target.value ? Number(e.target.value) : null });
        toast("Assignee updated", "ok", 1600);
        openTask(task.id, ctx);
      } catch (err) { toast(err.message, "err"); }
    },
  },
    el("option", { value: "" }, "Unassigned"),
    ...users.filter((u) => u.active).map((u) =>
      el("option", { value: u.id, selected: u.id === task.assignee_id }, `${u.name} (${u.role})`)),
    ...(suggestions.length && !task.assignee_id
      ? [el("option", { disabled: true }, "— AI fits —"),
         ...suggestions.slice(0, 3).map((s) => el("option", { value: s.user_id }, `${s.name} · fit ${s.fit}`))]
      : []),
  );

  const prioritySelect = el("select.input", {
    onchange: async (e) => {
      try { await api.updateTask(task.id, { priority: e.target.value }); toast("Priority updated", "ok", 1500); openTask(task.id, ctx); }
      catch (err) { toast(err.message, "err"); }
    },
  }, ["critical", "high", "medium", "low"].map((p) =>
    el("option", { value: p, selected: p === task.priority }, p)));

  const commentInput = el("textarea.input", {
    placeholder: "Write a comment…", rows: 2,
    style: "min-height:64px",
  });

  const commentList = el("div", {},
    task.comments.length
      ? task.comments.map((c) =>
          el("div.comment", {},
            avatar(c.author_name || "?", c.author_color, "sm"),
            el("div.comment-body", {},
              el("div.comment-head", {},
                el("span.comment-author", {}, c.author_name || "Unknown"),
                el("span.comment-time", {}, fmt.rel(c.created_at)),
              ),
              el("div.comment-text", {}, c.body),
            ),
          ))
      : el("div", { style:color_placeholder() }, "No comments yet."),
  );

  const factorPanel = score
    ? el("div.well", { style: "padding:14px 16px;margin-top:6px" },
        el("div.row", { style: "margin-bottom:12px" },
          el("span", { style: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700" }, "AI explainability"),
          el("div.spacer"),
          el("span.tscore", { style: "font-size:13px" }, `◆ ${score.score}`),
        ),
        score.factors.map((f) =>
          el("div.factor", {},
            el("span.fname", {}, f.label),
            el("div.ftrack", {}, el("div.ffill", { style: `width:${f.raw}%` })),
            el("span.fval", {}, `+${f.contribution}`),
          )),
        el("div", { style: "font-size:11px;color:var(--text-low);margin-top:8px" },
          `weighted sum · top driver: ${score.factors.reduce((a, b) => a.contribution > b.contribution ? a : b).label}`),
      )
    : null;

  const deps = task.dependencies || [];

  openModal(el("div", {},
    el("div.row", { style: "gap:8px;margin-bottom:6px;flex-wrap:wrap" },
      el("span.chip.gold", {}, project ? project.code : "—"),
      priorityChip(task.priority),
      typeChip(task.type),
      slaChip(task.due_at),
      el("div.spacer"),
      task.rank_score > 0 ? el("span.tscore", { style: "font-size:12.5px" }, `◆ ${task.rank_score}`) : null,
    ),
    el("h2", {}, task.title),
    el("div.row", { style: "margin:16px 0;gap:12px;flex-wrap:wrap" },
      el("div.field", { style: "margin:0;flex:1;min-width:160px" },
        el("label", {}, "Status"), statusSelect),
      el("div.field", { style: "margin:0;flex:1;min-width:160px" },
        el("label", {}, "Assignee"), assigneeSelect),
      el("div.field", { style: "margin:0;flex:1;min-width:130px" },
        el("label", {}, "Priority"), prioritySelect),
    ),
    task.description &&
      el("div.well", { style: "padding:14px 16px;margin-bottom:16px" },
        el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:7px" }, "Description"),
        el("div", { style: "color:var(--text-mid);font-size:13.5px;line-height:1.65;white-space:pre-wrap" }, task.description),
      ),
    factorPanel,
    deps.length &&
      el("div", { style: "margin-top:16px" },
        el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:8px" }, "Blocking dependencies"),
        deps.map((d) =>
          el("div.dep-item", {},
            el("span", { class: `st ${d.status === "done" ? "done" : "open"}` }, d.status === "done" ? "✓" : "●"),
            el("span", { style: "flex:1" }, d.title),
            el("span", { style: "color:var(--text-low);font-size:11px" }, d.status),
          )),
      ),
    el("div", { style: "margin-top:18px" },
      el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:8px" },
        `Comments (${task.comments.length})`),
      commentList,
      el("div.row", { style: "margin-top:10px;gap:9px;align-items:flex-end" },
        commentInput,
        el("button.btn.btn.btn-gold", {
          onclick: async () => {
            const body = commentInput.value.trim();
            if (!body) return;
            try {
              await api.comment(task.id, body);
              toast("Comment posted", "ok", 1500);
              openTask(task.id, ctx);
            } catch (err) { toast(err.message, "err"); }
          },
        }, "Post"),
      ),
    ),
    el("div.row", { style: "margin-top:22px;gap:10px;justify-content:flex-end" },
      ["admin", "lead"].includes(ctx.user?.role) &&
        el("button.btn.btn.btn-danger", {
          onclick: async () => {
            const ok = await confirmDialog("Delete task", `Delete “${task.title}”? This also removes its dependencies.`, { danger: true });
            if (!ok) return;
            try {
              await api.deleteTask(task.id);
              toast("Task deleted", "ok");
              closeModal();
              ctx.refreshCurrent();
            } catch (err) { toast(err.message, "err"); }
          },
        }, "Delete"),
      el("button.btn.btn", { onclick: closeModal }, "Close"),
    ),
  ), { wide: true });
}

function color_placeholder() {
  return "color:var(--text-low);font-size:12.5px;font-style:italic";
}

/* ── create task ────────────────────────────────────────────────── */

export function openCreateTask(ctx, defaults = {}) {
  const projects = ctx.cache.projects || [];
  if (!projects.length) {
    toast("Create a project first", "warn");
    return;
  }
  const users = (ctx.cache.users || []).filter((u) => u.active && u.role !== "viewer");

  const f = {
    project_id: el("select.input", {}, projects.map((p, i) =>
      el("option", { value: p.id, selected: (defaults.project_id ? p.id === defaults.project_id : i === 0) },
        `${p.code} — ${p.name}`))),
    title: el("input.input", { placeholder: "What needs to be done?", value: defaults.title || "" }),
    description: el("textarea.input", { placeholder: "Details, acceptance criteria, links…", rows: 3 }),
    type: el("select.input", {}, ["feature", "bug", "qa", "research", "chore", "doc"].map((t) =>
      el("option", { value: t, selected: t === (defaults.type || "feature") }, t))),
    priority: el("select.input", {}, ["critical", "high", "medium", "low"].map((p) =>
      el("option", { value: p, selected: p === (defaults.priority || "medium") }, p))),
    status: el("select.input", {}, COLUMNS.map((c) =>
      el("option", { value: c, selected: c === (defaults.status || "backlog") }, STATUS_LABELS[c]))),
    assignee_id: el("select.input", {},
      el("option", { value: "" }, "Unassigned"),
      users.map((u) => el("option", { value: u.id }, `${u.name} (${u.role})`))),
    estimate_hours: el("input.input", { type: "number", min: "0", step: "0.5", value: defaults.estimate_hours || "4" }),
    due_at: el("input.input", { type: "datetime-local" }),
    labels: el("input.input", { placeholder: "comma, separated, labels" }),
  };

  openModal(el("div", {},
    el("h2", {}, "New ", el("em", {}, "task")),
    el("div", { style: "height:18px" }),
    el("div.form-grid", {},
      el("div.field.full", {}, el("label", {}, "Title"), f.title),
      el("div.field", {}, el("label", {}, "Project"), f.project_id),
      el("div.field", {}, el("label", {}, "Assignee"), f.assignee_id),
      el("div.field", {}, el("label", {}, "Type"), f.type),
      el("div.field", {}, el("label", {}, "Priority"), f.priority),
      el("div.field", {}, el("label", {}, "Status"), f.status),
      el("div.field", {}, el("label", {}, "Estimate (h)"), f.estimate_hours),
      el("div.field full", { class: "field full" }, el("label", {}, "Due (optional)"), f.due_at),
      el("div.field full", { class: "field full" }, el("label", {}, "Labels"), f.labels),
      el("div.field.full", {}, el("label", {}, "Description"), f.description),
    ),
    el("div.row", { style: "justify-content:flex-end;gap:10px;margin-top:6px" },
      el("button.btn.btn.btn-ghost", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn.btn-gold", {
        onclick: async () => {
          const title = f.title.value.trim();
          if (!title) { toast("Title is required", "warn"); return; }
          const dueVal = f.due_at.value;
          try {
            await api.createTask({
              project_id: Number(f.project_id.value),
              title,
              description: f.description.value.trim() || null,
              type: f.type.value,
              priority: f.priority.value,
              status: f.status.value,
              assignee_id: f.assignee_id.value ? Number(f.assignee_id.value) : null,
              estimate_hours: Number(f.estimate_hours.value) || 0,
              due_at: dueVal ? new Date(dueVal).getTime() : null,
              labels: f.labels.value.split(",").map((s) => s.trim()).filter(Boolean),
            });
            toast("Task created · AI rank computed", "ok");
            closeModal();
            ctx.refreshCurrent();
          } catch (err) {
            toast(err.message || "Failed", "err");
          }
        },
      }, "Create task"),
    ),
  ), { wide: true });
}

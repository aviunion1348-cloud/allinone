/** QA Centre — edge-case matrix, QA/bug flow, report SLA. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, slaChip, priorityChip, sectionTitle,
  emptyState, toast, donut, STATUS_LABELS,
} from "../ui.js";

const GROUP_ORDER = ["blocked", "in_progress", "in_review", "todo", "done"];

export async function renderQA(ctx) {
  const content = $("#content");
  let data;
  try {
    data = await api.qa();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const { edgeCases, tasks, byStatus, openBugs, openQa, policy } = data;
  const canEdit = ["admin", "lead"].includes(ctx.user?.role);

  const kpi = (label, value, sub, { alert = false, gold = false } = {}) =>
    el(`div.kpi${alert ? " alert" : ""}`, {},
      el("div.kpi-label", {}, label),
      el(`div.kpi-value${gold ? " gold" : ""}`, {}, String(value)),
      el("div.kpi-sub", { html: sub }));

  const statusLabel = (s) => STATUS_LABELS[s] || s;

  const taskRow = (t) =>
    el("div.row", { style: "padding:8px 12px;gap:11px;border-bottom:1px solid var(--glass-border)" },
      priorityChip(t.priority),
      el("span", { style: "flex:1;font-size:13px" }, t.title),
      el("span.chip.type", {}, t.project_code),
      t.assignee_name
        ? avatar(t.assignee_name, null, "sm")
        : el("span.chip", {}, "unassigned"),
      t.due_at ? slaChip(t.due_at) : null,
    );

  const groups = GROUP_ORDER
    .map((s) => ({ status: s, rows: tasks.filter((t) => t.status === s) }))
    .filter((g) => g.rows.length);

  // admin/lead inline editor for the matrix counter
  const countInput = el("input.input", {
    type: "number", min: "0", step: "1",
    value: String(edgeCases.total),
    style: "width:130px",
  });
  const saveCount = async () => {
    try {
      await api.setEdgeCases(Number(countInput.value));
      toast("Edge-case matrix updated", "ok");
      ctx.refreshCurrent();
    } catch (err) { toast(err.message, "err"); }
  };

  mount(content, el("div.stack", {},
    /* edge-case matrix hero */
    el("div.card", {},
      sectionTitle("Edge-case matrix", "ship gate — every case accounted for"),
      el("div.row", { style: "margin-top:14px;gap:26px;flex-wrap:wrap" },
        donut(edgeCases.pct, { label: "OF TARGET" }),
        el("div", { style: "flex:1;min-width:220px" },
          el("div", { style: "font-size:34px;font-weight:800;letter-spacing:-.02em" },
            el("span", { style: "color:var(--gold-1)" }, fmt.num(edgeCases.total)),
            el("span", { style: "font-size:18px;color:var(--text-low)" }, ` / ${fmt.num(edgeCases.target)}`)),
          el("div", { style: "font-size:12px;color:var(--text-low);margin:4px 0 14px" },
            "cases documented and verified before ship"),
          canEdit
            ? el("div.row", { style: "gap:9px" },
                countInput,
                el("button.btn.btn-gold.sm", { onclick: saveCount }, "Update matrix"),
                el("span", { style: "font-size:11.5px;color:var(--text-low)" }, "admin / lead only"))
            : el("span", { style: "font-size:11.5px;color:var(--text-low)" },
                "ask an admin or lead to update the count")),
      ),
    ),

    el("div.kpi-grid", {},
      kpi("Open bugs", openBugs, "defects not yet closed", { alert: openBugs > 0 }),
      kpi("Open QA tasks", openQa, "verification work in flight", { gold: openQa > 0 && !openBugs }),
      kpi("QA report SLA", policy ? `${policy.window_h ?? "—"}h` : "—",
        policy ? policy.name : "policy not configured"),
    ),

    el("div.card", {},
      sectionTitle("QA & bug flow", "everything typed qa or bug"),
      tasks.length
        ? el("div", { style: "margin-top:10px" },
            groups.map((g) => el("div", { style: "margin-bottom:14px" },
              el("div", {
                style: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;" +
                  "font-weight:800;color:var(--gold-2);margin:6px 0 8px",
              }, `${statusLabel(g.status)} (${g.rows.length})`),
              g.rows.map(taskRow))))
        : emptyState("🛡", "No QA or bug tasks yet — the board is clean"),
    ),
  ));
}

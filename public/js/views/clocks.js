/** Turnover Clocks — live SLA countdowns for phases and tasks. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, slaChip, priorityChip, sectionTitle, emptyState,
} from "../ui.js";

export async function renderClocks(ctx) {
  const content = $("#content");
  let data;
  try {
    data = await api.clocks();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const { phases, tasks, breached, at_risk } = data;
  void ctx;

  const kpi = (label, value, sub, { alert = false, gold = false } = {}) =>
    el(`div.kpi${alert ? " alert" : ""}`, {},
      el("div.kpi-label", {}, label),
      el(`div.kpi-value${gold ? " gold" : ""}`, {}, String(value)),
      el("div.kpi-sub", { html: sub }));

  const phaseRow = (p) =>
    el("div.row", { style: "padding:10px 14px;gap:12px;border-bottom:1px solid var(--glass-border)" },
      el("span.chip.gold", {}, p.project_code),
      el("span", { style: "flex:1;font-weight:600;font-size:13.5px" }, p.name),
      el("span", { style: "font-size:11.5px;color:var(--text-low)" },
        `SLA ${p.sla_hours != null ? `${p.sla_hours}h` : "—"}`),
      el("span", { style: "font-size:11.5px;color:var(--text-mid)" }, fmt.rel(p.due_at)),
      slaChip(p.due_at),
    );

  const taskRow = (t) =>
    el("div.row", { style: "padding:9px 14px;gap:12px;border-bottom:1px solid var(--glass-border)" },
      el("span.chip.type", {}, t.project_code),
      el("span", { style: "flex:1;font-size:13px" }, t.title),
      t.assignee_name
        ? avatar(t.assignee_name, t.assignee_color, "sm")
        : el("span.chip", {}, "unassigned"),
      priorityChip(t.priority),
      slaChip(t.due_at),
    );

  mount(content, el("div.stack", {},
    el("div.kpi-grid", {},
      kpi("Breached", breached, "past turnover deadline", { alert: breached > 0 }),
      kpi("At risk", at_risk, "inside the danger window", { gold: at_risk > 0 && !breached }),
      kpi("Live clocks", phases.length + tasks.length,
        `<b>${phases.length}</b> phases · <b>${tasks.length}</b> tasks`),
    ),

    el("div.card", {},
      sectionTitle("Phase clocks", "active phases, nearest deadline first"),
      phases.length
        ? el("div", { style: "margin-top:10px" }, phases.map(phaseRow))
        : emptyState("⏱", "No phase clocks — nothing in flight"),
    ),

    el("div.card", {},
      sectionTitle("Task clocks", "open tasks carrying a due date"),
      tasks.length
        ? el("div", { style: "margin-top:10px" }, tasks.map(taskRow))
        : emptyState("⏱", "No task clocks — nothing due"),
    ),
  ));
}

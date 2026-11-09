/** Planning & Capacity — weekly workload, utilisation, project burn. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, sectionTitle, emptyState, barRow,
} from "../ui.js";

export async function renderPlanning(ctx) {
  const content = $("#content");
  let data;
  try {
    data = await api.planning();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const { members, projects, totals } = data;
  void ctx;

  const utilKind = (pct) => (pct > 100 ? "danger" : pct >= 85 ? "" : "ok");

  const memberRow = (m) => {
    const pct = m.utilization;
    return el("div.row", { style: "padding:10px 14px;gap:14px;border-bottom:1px solid var(--glass-border)" },
      avatar(m.name, m.color, "sm"),
      el("div", { style: "flex:1;min-width:120px" },
        el("div", { style: "font-size:13px;font-weight:650" }, m.name),
        el("div", { style: "font-size:11px;color:var(--text-low);text-transform:capitalize" },
          `${m.role} · ${m.open_tasks} open · ${m.wip} in progress`)),
      el("div", { style: "width:170px;flex:none" },
        barRow("", m.open_hours, m.capacity, { suffix: "h", kind: utilKind(pct) })),
      el("span", {
        class: `chip${pct > 100 ? " p-critical" : pct >= 85 ? " p-high" : " sla-ok"}`,
        style: "width:52px;justify-content:center",
      }, `${pct}%`),
    );
  };

  const projectRow = (p) =>
    el("div.row", { style: "padding:10px 14px;gap:14px;border-bottom:1px solid var(--glass-border)" },
      el("span.chip.gold", {}, p.code),
      el("div", { style: "flex:1;min-width:120px" },
        el("div", { style: "font-size:13px;font-weight:650" }, p.name),
        el("div", { style: "font-size:11px;color:var(--text-low);text-transform:capitalize" },
          `${p.status.replace("_", " ")} · ${p.open_tasks} open tasks`)),
      el("div", { style: "width:170px;flex:none" },
        barRow("", p.open_hours, p.budget_hours || p.open_hours || 1,
          { suffix: "h", kind: p.unassigned_tasks > 0 ? "" : "ok" })),
      p.budget_hours
        ? el("span", { style: "font-size:11.5px;color:var(--text-mid);width:74px;text-align:right" },
            `${fmt.hrs(p.open_hours)} / ${fmt.hrs(p.budget_hours)}`)
        : el("span", { style: "font-size:11.5px;color:var(--text-low);width:74px;text-align:right" }, "no budget"),
      p.unassigned_tasks > 0
        ? el("span.chip.p-high", { title: "Tasks without an owner" }, `${p.unassigned_tasks} unowned`)
        : null,
    );

  mount(content, el("div.stack", {},
    el("div.kpi-grid", {},
      el("div.kpi", {},
        el("div.kpi-label", {}, "Weekly capacity"),
        el("div.kpi-value", {}, fmt.hrs(totals.capacity_hours)),
        el("div.kpi-sub", { html: `<b>${members.length}</b> people` })),
      el("div.kpi", {},
        el("div.kpi-label", {}, "Committed"),
        el("div.kpi-value.gold", {}, fmt.hrs(totals.committed_hours)),
        el("div.kpi-sub", { html: `across <b>${projects.length}</b> live projects` })),
      el(`div.kpi${totals.unassigned > 0 ? " alert" : ""}`, {},
        el("div.kpi-label", {}, "Unowned work"),
        el("div.kpi-value", {}, String(totals.unassigned)),
        el("div.kpi-sub", {}, totals.unassigned ? "needs an owner" : "every task assigned")),
    ),

    el("div.card", {},
      sectionTitle("Team utilisation", "open hours against weekly capacity"),
      members.length
        ? el("div", { style: "margin-top:10px" }, members.map(memberRow))
        : emptyState("👥", "No team members yet")),

    el("div.card", {},
      sectionTitle("Project burn", "estimated open hours against budget"),
      projects.length
        ? el("div", { style: "margin-top:10px" }, projects.map(projectRow))
        : emptyState("📊", "No live projects to plan")),
  ));
}

/** Dashboard view — KPIs, turnover health, AI queue, workload, activity. */
import { api } from "../api.js";
import {
  $, el, mount, clear, fmt, avatar, priorityChip, slaChip, scoreBadge,
  donut, sparkline, barRow, sectionTitle, emptyState, toast, openModal,
  closeModal, STATUS_LABELS, STAGE_LABELS,
} from "../ui.js";
import { openTask } from "./board.js";

export async function renderDashboard(ctx) {
  const content = $("#content");
  mount(content, el("div.stack", {}, skeletonGrid()));

  let data;
  try {
    data = await api.dashboard();
  } catch (err) {
    mount(content, el("div.card", {}, `Failed to load: ${err.message}`));
    return;
  }

  const { kpis, byStatus, byPriority, throughput, priorityQueue, workload, activities, stageCounts, health } = data;

  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r.count]));
  const maxThroughput = Math.max(1, ...throughput.map((t) => t.count));
  void maxThroughput;

  const banner =
    health.breachedPhases.length || health.breachedTasks.length
      ? el("div.sla-banner.bad",
          { onclick: () => ctx.navigate("team") },
          el("span", { style: "font-size:18px" }, "⚠"),
          `${health.breachedPhases.length} phase SLA breach(es) + ${health.breachedTasks.length} overdue task(s) — turnover policy violated. Click to inspect.`,
        )
      : health.atRiskPhases.length
        ? el("div.sla-banner.warn", { onclick: () => ctx.navigate("team") },
            el("span", { style: "font-size:18px" }, "⏰"),
            `${health.atRiskPhases.length} phase(s) at risk of breaching turnover SLA.`,
          )
        : el("div.sla-banner.good",
            el("span", { style: "font-size:18px" }, "✓"),
            "All active phases within turnover SLA.",
          );

  const kpiCard = (label, value, sub, { gold = false, alert = false } = {}) =>
    el(`div.kpi${alert ? " alert" : ""}`, {},
      el("div.kpi-label", {}, label),
      el(`div.kpi-value${gold ? " gold" : ""}`, {}, String(value)),
      el("div.kpi-sub", { html: sub }),
    );

  const stageMax = Math.max(1, ...stageCounts.map((s) => s.count));

  const grid = el("div", {},
    banner,

    el("div.kpi-grid", {},
      kpiCard("Active projects", kpis.active_projects, `<b>${kpis.open_tasks}</b> open tasks · <b>${kpis.open_hours}</b>h loaded`, { gold: true }),
      kpiCard("WIP in progress", kpis.wip, `<b>${kpis.done_7d}</b> done last 7 days`),
      kpiCard("Overdue tasks", kpis.overdue, kpis.overdue ? "needs attention" : "clean board", { alert: kpis.overdue > 0 }),
      kpiCard("Turnover compliance", `${kpis.compliance_pct}%`, `<b>${health.compliance.onTime}/${health.compliance.total}</b> phases on time`, { gold: true }),
      kpiCard("SLA breaches", kpis.breached, `<b>${kpis.at_risk}</b> at risk`, { alert: kpis.breached > 0 }),
      kpiCard("Pipeline active", kpis.pipeline_active, `<b>${kpis.leads}</b> leads in play`),
    ),

    el("div.grid-23", {},
      /* left column */
      el("div.stack", {},
        el("div.card", {},
          sectionTitle("AI priority queue", "explainable · click for factors"),
          priorityQueue.length
            ? el("div", {}, priorityQueue.slice(0, 6).map((t, i) =>
                el("div.row",
                  {
                    style: "padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer",
                    onclick: () => openTask(t.id, ctx),
                  },
                  el("span", { style: "width:22px;font-family:var(--font-display);font-weight:700;color:var(--gold-4)" }, `#${i + 1}`),
                  el("div", { style: "flex:1;min-width:0" },
                    el("div", { style: "font-weight:600;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" }, t.title),
                    el("div", { style: "font-size:11px;color:var(--text-low);margin-top:2px" },
                      `${t.topReason} · ${STATUS_LABELS[t.status] || t.status}`),
                  ),
                  priorityChip(t.priority),
                  el("span.tscore", {}, `◆ ${t.score}`),
                )))
            : emptyState("◆", "No open tasks to rank"),
        ),

        el("div.card", {},
          sectionTitle("Throughput — tasks completed", "last 14 days"),
          throughput.length
            ? sparkline(throughput)
            : emptyState("📈", "Complete some tasks to build the curve"),
        ),

        el("div.card", {},
          sectionTitle("Task distribution"),
          el("div", {},
            ["backlog", "todo", "in_progress", "in_review", "blocked", "done"].map((s) =>
              barRow(STATUS_LABELS[s], statusMap[s] || 0, Math.max(1, ...Object.values(statusMap)), {
                kind: s === "blocked" ? "danger" : s === "done" ? "ok" : "",
              })),
          ),
          el("div", { style: "margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06)" },
            sectionTitle("Open by priority"),
            byPriority.length
              ? el("div", {}, byPriority.map((p) =>
                  barRow(p.priority, p.count, Math.max(...byPriority.map((x) => x.count)), {
                    kind: p.priority === "critical" ? "danger" : "",
                  })))
              : emptyState("◇", "Nothing open"),
          ),
        ),
      ),

      /* right column */
      el("div.stack", {},
        el("div.card", {},
          sectionTitle("Turnover health", "from pipeline SLA policy"),
          el("div.donut-wrap", {},
            donut(health.compliance.pct),
            el("div", { style: "flex:1" },
              el("div.row", { style: "justify-content:space-between;margin-bottom:8px" },
                el("span", { style: "color:var(--text-low);font-size:12px" }, "Phases on time"),
                el("span", { style: "font-weight:700;color:var(--gold-1)" },
                  `${health.compliance.onTime}/${health.compliance.total}`),
              ),
              el("div.row", { style: "justify-content:space-between;margin-bottom:8px" },
                el("span", { style: "color:var(--text-low);font-size:12px" }, "Breached phases"),
                el("span", { style: "font-weight:700;color:var(--danger)" }, String(health.breachedPhases.length)),
              ),
              el("div.row", { style: "justify-content:space-between" },
                el("span", { style: "color:var(--text-low);font-size:12px" }, "Due within 24h"),
                el("span", { style: "font-weight:700;color:var(--warn)" }, String(health.dueToday.length)),
              ),
            ),
          ),
          (health.breachedPhases.length || health.dueToday.length) &&
            el("div", { style: "margin-top:14px" },
              [...health.breachedPhases.slice(0, 3), ...health.dueToday.slice(0, 3)].map((p) =>
                el("div.row", { style: "padding:7px 0;border-top:1px solid rgba(255,255,255,.05);gap:8px" },
                  el("span.dot", { class: p.sla?.state === "breached" ? "bad" : "warn" }),
                  el("span", { style: "flex:1;font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" },
                    `${p.project_code || ""} · ${p.name || p.title}`),
                  slaChip(p.due_at),
                )),
            ),
        ),

        el("div.card", {},
          sectionTitle("Team workload", "open tasks per person"),
          workload.slice(0, 7).map((w) =>
            el("div.row", { style: "padding:7px 0;gap:11px" },
              avatar(w.name, w.color, "sm"),
              el("div", { style: "flex:1;min-width:0" },
                el("div.row", { style: "justify-content:space-between" },
                  el("span", { style: "font-size:13px;font-weight:600" }, w.name),
                  el("span", { style: "font-size:11px;color:var(--text-low)" },
                    `${w.wip || 0} wip · ${fmt.hrs(w.open_hours)} `),
                ),
                el("div.bar-track", { style: "height:7px;margin-top:5px" },
                  el("div.bar-fill", {
                    style: `width:${Math.min(100, Math.round(((w.open_tasks || 0) / Math.max(1, w.capacity_hours_week / 6)) * 100))}%`,
                    class: (w.open_tasks || 0) > w.capacity_hours_week / 5 ? "danger" : "",
                  })),
              ),
            )),
        ),

        el("div.card", {},
          sectionTitle("Pipeline funnel"),
          stageCounts.length
            ? el("div", {}, stageCounts
                .filter((s) => s.stage !== "lost")
                .sort((a, b) => b.count - a.count)
                .map((s) => barRow(STAGE_LABELS[s.stage] || s.stage, s.count, stageMax, { kind: "" })))
            : emptyState("◇", "No clients yet"),
        ),

        el("div.card", {},
          sectionTitle("Recent activity"),
          activities.length
            ? el("div.feed", {}, activities.slice(0, 8).map((a) =>
                el("div.feed-item", {},
                  avatar(a.actor_name || "?", a.actor_color || "#e8b923", "sm"),
                  el("div.feed-body", {},
                    el("div.feed-text", {}, el("b", {}, a.actor_name || "System"), " ", a.summary),
                    el("div.feed-time", {}, fmt.rel(a.created_at)),
                  ),
                )))
            : emptyState("◇", "Nothing yet"),
        ),
      ),
    ),
  );

  mount(content, grid);
}

function skeletonGrid() {
  return el("div", {},
    el("div.kpi-grid", {}, Array.from({ length: 6 }, () =>
      el("div.kpi.skeleton", { style: "height:112px" }))),
    el("div.grid-23", {},
      el("div.stack", {}, el("div.card.skeleton", { style: "height:320px" })),
      el("div.stack", {}, el("div.card.skeleton", { style: "height:320px" })),
    ),
  );
}

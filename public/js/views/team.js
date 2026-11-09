/** Team & SLA view — workload, turnover health detail, policies. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, slaChip, sectionTitle, emptyState, toast,
} from "../ui.js";

export async function renderTeam(ctx) {
  const content = $("#content");
  let workload, health, policies;
  try {
    [workload, health, policies] = await Promise.all([
      api.workload(), api.slaHealth(), api.slaPolicies(),
    ]);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const maxOpen = Math.max(1, ...workload.map((w) => w.open_tasks || 0));

  mount(content, el("div.stack", {},
    /* SLA breach board */
    (health.breachedPhases.length || health.breachedTasks.length || health.atRiskPhases.length)
      ? el("div.card", {},
          sectionTitle("Turnover violations", "strict SLA policy enforcement"),
          health.breachedPhases.length &&
            el("div", { style: "margin-bottom:14px" },
              el("div", { style: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--danger);font-weight:800;margin-bottom:8px" },
                `Breached phases (${health.breachedPhases.length})`),
              health.breachedPhases.map((p) =>
                el("div.row", { style: "padding:9px 12px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.28);border-radius:8px;margin-bottom:7px;gap:10px" },
                  el("span.dot.bad"),
                  el("span.chip.gold", {}, p.code),
                  el("span", { style: "flex:1;font-weight:600" }, p.name),
                  slaChip(p.due_at),
                )),
            ),
          health.breachedTasks.length &&
            el("div", { style: "margin-bottom:14px" },
              el("div", { style: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--warn);font-weight:800;margin-bottom:8px" },
                `Overdue tasks (${health.breachedTasks.length})`),
              health.breachedTasks.map((t) =>
                el("div.row", { style: "padding:8px 12px;background:rgba(255,180,84,.07);border:1px solid rgba(255,180,84,.25);border-radius:8px;margin-bottom:7px;gap:10px" },
                  el("span.dot.warn"),
                  el("span.chip.type", {}, t.project_code),
                  el("span", { style: "flex:1;font-size:13px" }, t.title),
                  slaChip(t.due_at),
                )),
            ),
          health.atRiskPhases.length &&
            el("div", {},
              el("div", { style: "font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:800;margin-bottom:8px" },
                `At risk (${health.atRiskPhases.length})`),
              health.atRiskPhases.map((p) =>
                el("div.row", { style: "padding:8px 12px;background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.22);border-radius:8px;margin-bottom:7px;gap:10px" },
                  el("span.dot.warn"),
                  el("span.chip.gold", {}, p.code),
                  el("span", { style: "flex:1;font-size:13px" }, p.name),
                  slaChip(p.due_at),
                )),
            ),
        )
      : el("div.sla-banner.good", el("span", { style: "font-size:18px" }, "✓"),
          `All clear — ${health.compliance.pct}% turnover compliance (${health.compliance.onTime}/${health.compliance.total} phases on time).`),

    el("div.grid-2", {},
      el("div.card", {},
        sectionTitle("Team workload"),
        workload.length
          ? el("div", {}, workload.map((w) =>
              el("div.row", { style: "padding:11px 4px;border-bottom:1px solid rgba(255,255,255,.05);gap:12px" },
                avatar(w.name, w.color),
                el("div", { style: "flex:1;min-width:0" },
                  el("div.row", { style: "justify-content:space-between" },
                    el("span", { style: "font-weight:600;font-size:13.5px" }, w.name),
                    el("span", { style: "font-size:11px;color:var(--text-low)" },
                      `${w.open_tasks || 0} open · ${w.wip || 0} wip`),
                  ),
                  el("div.bar-track", { style: "height:9px;margin-top:6px" },
                    el(`div.bar-fill${(w.open_tasks || 0) > maxOpen * 0.8 ? ".danger" : ""}`, {
                      style: `width:${((w.open_tasks || 0) / maxOpen) * 100}%`,
                    })),
                  el("div", { style: "font-size:11px;color:var(--text-low);margin-top:4px" },
                    `${fmt.hrs(w.open_hours)} open · cap ${w.capacity_hours_week}h/wk`),
                ),
              )))
          : emptyState("◇", "No team loaded"),
      ),

      el("div.card", {},
        sectionTitle("SLA policy book", "from the pipeline document"),
        el("div", {}, policies.map((p) =>
          el("div", { style: "padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05)" },
            el("div.row", { style: "gap:8px" },
              el("span.strong", { style: "font-weight:700;font-size:13.5px;flex:1" }, p.name),
              el("span.chip.gold", {},
                p.hours != null ? (p.hours >= 24 ? `${p.hours / 24}d` : `${p.hours}h`) : `${fmt.num(p.value)} ${p.unit}`),
              el("span.chip.type", {}, p.scope),
            ),
            el("div", { style: "font-size:12px;color:var(--text-low);margin-top:5px;line-height:1.55" },
              p.description),
          )),
        ),
      ),
    ),
  ));
}

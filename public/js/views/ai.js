/** AI Priorities view — ranked queue, factor breakdowns, weight tuning. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, priorityChip, sectionTitle, emptyState, toast,
  STATUS_LABELS, openModal, closeModal,
} from "../ui.js";
import { openTask } from "./board.js";

const WEIGHT_LABELS = {
  priority: "Intrinsic priority",
  urgency: "Due-date urgency",
  slaRisk: "Turnover / SLA risk",
  blocking: "Dependency leverage",
  effort: "Effort (quick wins)",
  projectPriority: "Project priority",
  freshness: "Staleness signal",
  load: "Load balancing",
};

export async function renderAI(ctx) {
  const content = $("#content");
  let ranks, weights;
  try {
    [ranks, weights] = await Promise.all([api.aiRanks(50), api.aiWeights()]);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);

  mount(content, el("div", {},
    el("div.row", { style: "margin-bottom:16px;gap:12px;flex-wrap:wrap" },
      el("div", { style: "flex:1;min-width:300px;color:var(--text-mid);font-size:13px;line-height:1.6" },
        "Explainable multi-factor ranking (WSJF-inspired): every score is a weighted sum of 8 auditable factors. Scores refresh automatically whenever board state changes."),
      el("button.btn.btn", { onclick: () => openWeights(ctx, weights) }, "⚙ Tune weights"),
      el("button.btn.btn-gold", {
        onclick: async () => {
          try {
            const r = await api.recompute();
            toast(`Re-ranked ${r.ranked} tasks`, "ok");
            renderAI(ctx);
          } catch (err) { toast(err.message, "err"); }
        },
      }, "↻ Recompute now"),
    ),

    el("div.grid-23", {},
      el("div.card", {},
        sectionTitle("Priority queue", `${ranks.length} open tasks ranked`),
        ranks.length
          ? el("div.table-wrap", {},
              el("table.tbl", {},
                el("thead", {}, el("tr", {},
                  el("th", { style: "width:36px" }, "#"),
                  el("th", {}, "Task"),
                  el("th", {}, "Priority"),
                  el("th", {}, "Status"),
                  el("th", {}, "Top driver"),
                  el("th", { style: "text-align:right" }, "Score"),
                )),
                el("tbody", {}, ranks.map((t, i) =>
                  el("tr", { style: "cursor:pointer", onclick: () => openTask(t.id, ctx) },
                    el("td", { style: "font-family:var(--font-display);font-weight:700;color:var(--gold-4)" }, i + 1),
                    el("td.strong", {}, t.title),
                    el("td", {}, priorityChip(t.priority)),
                    el("td", {}, STATUS_LABELS[t.status] || t.status),
                    el("td", { style: "font-size:12px;color:var(--text-low)" }, t.topReason),
                    el("td", { style: "text-align:right" },
                      el("span.tscore", { style: "font-size:12.5px" }, `◆ ${t.score}`)),
                  ))),
              ),
            )
          : emptyState("◆", "No open tasks"),
      ),

      el("div.stack", {},
        el("div.card", {},
          sectionTitle("Model weights", `Σ = ${weightSum.toFixed(2)}`),
          Object.entries(weights).map(([k, v]) =>
            el("div.factor", {},
              el("span.fname", { title: k }, WEIGHT_LABELS[k] || k),
              el("div.ftrack", {}, el("div.ffill", { style: `width:${v * 100 * 3}%` })),
              el("span.fval", {}, `${(v * 100).toFixed(1)}%`),
            )),
          el("div", { style: "font-size:11.5px;color:var(--text-low);margin-top:10px;line-height:1.6" },
            "Weights are normalised on save. Tuning requires admin/lead role."),
        ),

        el("div.card", {},
          sectionTitle("How scoring works"),
          el("ol", { style: "padding-left:18px;color:var(--text-mid);font-size:13px;line-height:1.85" },
            el("li", {}, "Collect all open tasks with project priority + phase SLA context."),
            el("li", {}, "Score 8 factors 0–100 each (urgency decays exponentially on time-to-due)."),
            el("li", {}, "Weighted sum → 0–100 rank_score, persisted per task."),
            el("li", {}, "Every modal shows factor contributions — nothing is a black box."),
            el("li", {}, "Recompute runs on every mutation (create/move/update)."),
          ),
        ),
      ),
    ),
  ));
}

function openWeights(ctx, current) {
  const inputs = {};
  openModal(el("div", {},
    el("h2", {}, "AI ", el("em", {}, "weight tuning")),
    el("div", { style: "color:var(--text-low);font-size:12.5px;margin-top:6px" },
      "Relative importance of each factor. Values are normalised to sum to 1."),
    el("div", { style: "height:16px" }),
    Object.entries(current).map(([k, v]) => {
      const input = el("input.input", {
        type: "number", min: "0", max: "1", step: "0.01", value: String(v),
      });
      inputs[k] = input;
      return el("div.field", {},
        el("label", {}, WEIGHT_LABELS[k] || k),
        input,
      );
    }),
    el("div.row", { style: "justify-content:flex-end;gap:10px" },
      el("button.btn.btn-ghost", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn-gold", {
        onclick: async () => {
          const payload = {};
          for (const [k, input] of Object.entries(inputs)) payload[k] = Number(input.value) || 0;
          try {
            await api.setAiWeights(payload);
            await api.recompute();
            toast("Weights saved · ranks refreshed", "ok");
            closeModal();
            renderAI(ctx);
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Save & recompute"),
    ),
  ));
}

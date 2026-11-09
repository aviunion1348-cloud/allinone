/** Roadmap view — Excalidraw pipeline doc + phase Gantt-lite + open link. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, slaChip, sectionTitle, emptyState, renderMarkdown, toast,
} from "../ui.js";

export async function renderRoadmap(ctx) {
  const content = $("#content");
  mount(content, el("div.stack", {}, el("div.card.skeleton", { style: "height:300px" })));

  let data;
  try {
    data = await api.roadmap();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const phases = (data.phases || []).filter((p) => p.status !== "pending");

  mount(content, el("div.stack", {},
    el("div.card", {},
      el("div.row", { style: "gap:14px;flex-wrap:wrap" },
        el("div", { style: "flex:1;min-width:280px" },
          el("div.card-title", {}, "Master pipeline & roadmap"),
          el("div", { style: "color:var(--text-mid);font-size:13.5px;line-height:1.65" },
            "The source-of-truth Excalidraw board — outreach personas, consultation flow, turnover rules, module/milestone SLAs and shipping gates. Synced + decrypted into the repo by CI ",
            el("code", { style: "color:var(--gold-2)" }, "sync:excalidraw"),
            "."),
        ),
        el("a.btn.btn-gold", { href: data.excalidraw_url, target: "_blank", rel: "noopener" }, "↗ Open Excalidraw"),
      ),
    ),

    phases.length
      ? el("div.card", {},
          sectionTitle("Active delivery clocks", "live from project phases"),
          el("div.phase-list", {}, phases
            .sort((a, b) => (a.due_at || Infinity) - (b.due_at || Infinity))
            .slice(0, 14)
            .map((ph) =>
              el("div.phase", { style: `border-color:${ph.status === "active" ? "var(--gold-3)" : "rgba(255,255,255,.07)"}` },
                el("span.chip.gold", { style: "flex:none" }, ph.project_code),
                el("div.phase-info", {},
                  el("div.phase-name", {}, ph.name),
                  el("div.phase-meta", {}, `${ph.project_name} · ${ph.status}`),
                ),
                ph.due_at ? slaChip(ph.due_at) : null,
                ph.completed_at && el("span", { style: "font-size:11px;color:var(--ok)" }, `done ${fmt.rel(ph.completed_at)}`),
              ))),
        )
      : null,

    data.markdown
      ? el("div.card", {},
          el("div.row", { style: "margin-bottom:6px" },
            sectionTitle("Pipeline document", `synced ${fmt.rel(data.synced_at)}`),
          ),
          el("div.well", { style: "padding:22px 26px;max-height:560px;overflow-y:auto" },
            renderMarkdown(data.markdown)),
        )
      : el("div.card", {}, emptyState("📄", "Pipeline doc not synced yet — run npm run sync:excalidraw (CI does this automatically).")),
  ));
}

/** Clients — every account, straight into its Partner Console. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, sectionTitle, emptyState, STAGE_LABELS,
} from "../ui.js";

export async function renderClients(ctx) {
  const content = $("#content");
  let clients, stages;
  try {
    [clients, stages] = await Promise.all([api.clients(), api.pipelineStages()]);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const query = { text: "" };
  const listBox = el("div", { style: "margin-top:10px" });

  const row = (c) =>
    el("div.row", { style: "padding:11px 14px;gap:13px;border-bottom:1px solid var(--glass-border)" },
      avatar(c.company || c.name, null, "sm"),
      el("div", { style: "flex:1;min-width:150px" },
        el("div", { style: "font-size:13.5px;font-weight:650" }, c.company || c.name),
        el("div", { style: "font-size:11.5px;color:var(--text-low)" },
          [c.name, c.email].filter(Boolean).join(" · "))),
      el("span.chip.gold", {}, STAGE_LABELS[c.stage] || c.stage),
      el("span", { style: "font-size:11.5px;color:var(--text-mid);width:74px;text-align:right" },
        c.stage_since ? fmt.rel(c.stage_since) : "—"),
      el("button.btn.xs", { onclick: () => ctx.navigate("partner", c.id) }, "Console"),
    );

  const paint = () => {
    const q = query.text.toLowerCase();
    const filtered = q
      ? clients.filter((c) =>
          [c.company, c.name, c.email].some((v) => String(v || "").toLowerCase().includes(q)))
      : clients;
    listBox.replaceChildren(
      ...(filtered.length
        ? [el("div", {}, filtered.map(row))]
        : [emptyState("🔍", q ? "No clients match that search" : "No clients yet")]),
    );
  };

  const search = el("input.input", {
    placeholder: "Search company, contact, email…",
    style: "width:250px",
    oninput: (e) => { query.text = e.target.value; paint(); },
  });

  mount(content, el("div.stack", {},
    el("div.row", { style: "justify-content:space-between;flex-wrap:wrap;gap:10px" },
      sectionTitle("Accounts", `${clients.length} client${clients.length === 1 ? "" : "s"} on file`),
      search),

    stages && stages.length
      ? el("div.row.wrap", { style: "gap:7px" },
          stages.filter((s) => s.count > 0).map((s) =>
            el("span.chip", { title: `Stage: ${STAGE_LABELS[s.key] || s.key}` },
              `${STAGE_LABELS[s.key] || s.key} · ${s.count}`)))
      : null,

    el("div.card", {},
      clients.length
        ? listBox
        : emptyState("🏢", "No clients yet — add one in the Pipeline")),
  ));

  paint();
}

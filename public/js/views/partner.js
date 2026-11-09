/** Partner Console — one account with everything attached to it. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, slaChip, sectionTitle, emptyState, STAGE_LABELS,
} from "../ui.js";

export async function renderPartner(param, ctx) {
  const content = $("#content");
  let clients;
  try {
    clients = await api.clients();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  if (!clients.length) {
    mount(content, el("div.stack", {},
      sectionTitle("Partner Console", "full account view"),
      el("div.card", {}, emptyState("🤝", "No clients yet — add one in the Pipeline"))));
    return;
  }

  const id = Number(param) || clients[0].id;
  let data;
  try {
    data = await api.clientConsole(id);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const selector = el("select.input", { style: "width:270px",
    onchange: (e) => ctx.navigate("partner", Number(e.target.value)) },
    clients.map((c) => el("option", { value: String(c.id), selected: c.id === id },
      `${c.company || c.name}`)));

  const phaseRow = (ph) =>
    el("div.row", { style: "padding:7px 10px;gap:10px;border-bottom:1px solid var(--glass-border)" },
      el("span", { style: "flex:1;font-size:12.5px;font-weight:600" }, ph.name),
      el("span", { style: "font-size:11px;color:var(--text-low);text-transform:capitalize" }, ph.status),
      slaChip(ph.due_at),
    );

  const projectCard = (p) =>
    el("div", { style: "padding:12px 14px;border:1px solid var(--glass-border);border-radius:10px;margin-bottom:10px;background:rgba(255,255,255,.02)" },
      el("div.row", { style: "gap:10px" },
        el("span.chip.gold", {}, p.code),
        el("span", { style: "flex:1;font-size:13.5px;font-weight:650" }, p.name),
        el("span.chip", { style: "text-transform:capitalize" }, p.status.replace("_", " ")),
        el("span", { style: "font-size:11.5px;color:var(--text-low)" },
          `${p.tasks_open}/${p.tasks_total} open`)),
      p.phases.length
        ? el("div", { style: "margin-top:8px" }, p.phases.map(phaseRow))
        : el("div", { style: "font-size:11.5px;color:var(--text-low);margin-top:8px" }, "No phases yet"),
    );

  mount(content, el("div.stack", {},
    el("div.row", { style: "justify-content:space-between;flex-wrap:wrap;gap:10px" },
      sectionTitle("Partner Console", "projects · releases · activity, one account"),
      selector),

    el("div.card", {},
      el("div.row", { style: "gap:14px;flex-wrap:wrap" },
        el("div", { style: "flex:1;min-width:200px" },
          el("div", { style: "font-size:19px;font-weight:800" }, data.company || data.name),
          el("div", { style: "font-size:12.5px;color:var(--text-mid);margin-top:3px" },
            [data.name, data.email, data.contact].filter(Boolean).join(" · "))),
        el("span.chip.gold", {}, STAGE_LABELS[data.stage] || data.stage),
        data.stage_since
          ? el("span", { style: "font-size:11.5px;color:var(--text-low)" },
              `in stage since ${fmt.rel(data.stage_since)}`)
          : null,
      )),

    el("div.card", {},
      sectionTitle("Projects", `${data.projects.length} attached`),
      data.projects.length
        ? el("div", { style: "margin-top:10px" }, data.projects.map(projectCard))
        : emptyState("📁", "No projects for this account yet")),

    data.releases.length
      ? el("div.card", {},
          sectionTitle("Releases", `${data.releases.length} cut`),
          el("div", { style: "margin-top:8px" },
            data.releases.map((r) => el("div.row", {
              style: "padding:8px 10px;gap:11px;border-bottom:1px solid var(--glass-border)" },
              el("span.chip", { style: "text-transform:capitalize" }, r.status.replace("_", " ")),
              el("span", { style: "flex:1;font-size:13px;font-weight:600" },
                r.name, r.version ? el("em", { style: "color:var(--gold-2);font-style:normal" }, ` ${r.version}`) : null),
              el("span", { style: "font-size:11.5px;color:var(--text-mid)" },
                r.shipped_at ? fmt.dateTime(r.shipped_at) : fmt.rel(r.created_at))))))
      : null,

    el("div.card", {},
      sectionTitle("Activity", "everything that happened to this account"),
      data.activities.length
        ? el("div", { style: "margin-top:8px" },
            data.activities.slice(0, 14).map((a) => el("div.row", {
              style: "padding:7px 10px;gap:11px;border-bottom:1px solid var(--glass-border)" },
              el("span.chip.type", {}, a.action),
              el("span", { style: "flex:1;font-size:12.5px" }, a.summary || `${a.entity} #${a.entity_id}`),
              el("span", { style: "font-size:11px;color:var(--text-low)" }, fmt.rel(a.created_at)))))
        : emptyState("📜", "No activity recorded yet")),
  ));
}

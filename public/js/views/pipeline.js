/** Client pipeline — stage columns with SLA countdowns + client detail. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, STAGE_LABELS, STAGE_ORDER, STAGE_SLA, slaChip,
  toast, openModal, closeModal, confirmDialog, sectionTitle, emptyState, priorityChip,
} from "../ui.js";

export async function renderPipeline(ctx) {
  const content = $("#content");

  let clients, stageInfo, playbook;
  try {
    [clients, stageInfo, playbook] = await Promise.all([
      api.clients(), api.pipelineStages(), api.playbook(),
    ]);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const badge = $("#nav-pipeline-count");
  if (badge) badge.textContent = String(clients.filter((c) => !["won", "lost"].includes(c.stage)).length);

  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, []]));
  for (const c of clients) {
    (byStage[c.stage] ??= []).push(c);
  }

  const stageBudget = {
    outreach: 72, initial_consultation: 72, technical_consultation: 72, planning: 32,
    kickoff: 168, development: 336, qa: 12, shipping: 120, maintenance: 720,
  };

  const wrap = el("div", {},
    el("div.row", { style: "margin-bottom:16px;gap:12px;flex-wrap:wrap" },
      el("div", { style: "color:var(--text-mid);font-size:13px;flex:1;min-width:260px" },
        "First technical consultation → handover. Stage budgets come straight from the Excalidraw turnover policy (",
        el("code", { style: "color:var(--gold-2)" }, "plan ≤ 3d"),
        " · ",
        el("code", { style: "color:var(--gold-2)" }, "QA ≤ 12h"),
        " · ",
        el("code", { style: "color:var(--gold-2)" }, "ship ≤ 5d"),
        ")."),
      el("button.btn.btn-gold", { onclick: () => openCreateClient(ctx) }, "+ Add client"),
    ),

    /* persona playbook — who you're talking to and how to position */
    el("div.card", { style: "margin-bottom:18px" },
      sectionTitle("Persona playbook", "understand who the client is before you pitch"),
      el("div.grid-3", {},
        playbook.personas.map((p) =>
          el("div.well", {
            style: `padding:15px 17px;border-color:${p.color}33;background:linear-gradient(160deg, ${p.color}12, transparent 70%)`,
          },
            el("div.row", { style: "gap:8px;margin-bottom:8px" },
              el("span.dot", { style: `background:${p.color};box-shadow:0 0 8px ${p.color}` }),
              el("span", { style: `font-weight:800;font-size:13.5px;color:${p.color}` }, p.label),
              el("div.spacer"),
              el("span.tlabel", {}, p.region_hint),
            ),
            el("div", { style: "font-size:12.5px;color:var(--text-mid);line-height:1.6;margin-bottom:10px" }, p.who),
            el("div", {
              style: "font-size:12.5px;color:var(--text-hi);border-top:1px dashed rgba(255,255,255,.1);padding-top:9px",
            },
              el("span", { style: "color:var(--gold-2);font-weight:700;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;display:block;margin-bottom:4px" },
                "Market as"),
              `“${p.market_as}”`,
            ),
          )),
      ),
      el("div.grid-2", { style: "margin-top:16px" },
        el("div", {},
          el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:8px" },
            "Delivery roles"),
          el("div.row.wrap", { style: "gap:8px" },
            playbook.roles.map((r) =>
              el("span.chip.gold", { title: r.holders }, `${r.role}: ${r.holders}`)),
          ),
        ),
        el("div", {},
          el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:8px" },
            "Comms protocol"),
          el("ul", { style: "padding-left:18px;color:var(--text-mid);font-size:12.5px;line-height:1.7" },
            playbook.comms.slice(0, 3).map((c) => el("li", {}, c))),
        ),
      ),
    ),

    el("div.pipeline", {},
      STAGE_ORDER.map((stage) => {
        const list = byStage[stage] || [];
        const budget = stageBudget[stage];
        return el("div.stage", {},
          el("div.stage-head", {},
            el("div.row", { style: "justify-content:space-between" },
              el("span.stage-name", {}, STAGE_LABELS[stage]),
              el("span.count", {
                style: "font-size:10.5px;font-weight:800;color:var(--gold-1);background:rgba(212,175,55,.14);border:1px solid rgba(212,175,55,.3);border-radius:99px;padding:1px 8px",
              }, String(list.length)),
            ),
            el("span.stage-sla", {}, STAGE_SLA[stage] || (budget ? `budget ${budget}h` : "")),
          ),
          el("div.stage-body", {},
            list.length
              ? list.map((c) => clientCard(c, ctx, budget))
              : el("div.column-empty", {}, "empty"),
          ),
        );
      }),
    ),

    el("div.card", { style: "margin-top:18px" },
      sectionTitle("Turnover SLA policies", "synced from pipeline document"),
      el("div.table-wrap", {},
        el("table.tbl", {},
          el("thead", {}, el("tr", {},
            el("th", {}, "Policy"), el("th", {}, "Scope"), el("th", {}, "Budget"), el("th", {}, "Rule"),
          )),
          el("tbody", {}, stageInfo.policies.map((p) =>
            el("tr", {},
              el("td.strong", {}, p.name),
              el("td", {}, el("span.chip.type", {}, p.scope)),
              el("td", { style: "color:var(--gold-1);font-weight:700" },
                p.hours != null ? (p.hours >= 24 ? `${p.hours / 24} days` : `${p.hours} hours`)
                  : `${fmt.num(p.value)} ${p.unit}`),
              el("td", { style: "font-size:12px;color:var(--text-low);max-width:420px" }, p.description),
            ))),
        ),
      ),
    ),
  );

  mount(content, wrap);
}

function clientCard(c, ctx, budgetH) {
  const slaTs = budgetH ? c.stage_entered_at + budgetH * 3600_000 : null;
  return el("div.client-card", { onclick: () => openClient(c.id, ctx) },
    el("div.row", { style: "justify-content:space-between;gap:6px" },
      el("span.co", {}, c.company),
      slaTs ? slaChip(slaTs) : null,
    ),
    el("div.ct", {}, c.contact_name || c.name),
    el("div.cmeta", {},
      c.persona && el(`span.persona.${c.persona}`, {}, c.persona),
      c.region && el("span.tlabel", {}, c.region),
      c.deal_band && el("span.tlabel", {}, `deal ${c.deal_band.toUpperCase()}`),
      el("div.spacer"),
      c.owner_name && avatar(c.owner_name, "#d4af37", "xs"),
    ),
    c.project_count > 0 &&
      el("div", { style: "font-size:10.5px;color:var(--gold-4);margin-top:7px;font-weight:700" },
        `${c.project_count} project(s) →`),
  );
}

async function openClient(id, ctx) {
  let client;
  try {
    client = await api.client(id);
  } catch (err) { toast(err.message, "err"); return; }

  const stages = STAGE_ORDER.concat(["lost"]);
  const stageSelect = el("select.input", {}, stages.map((s) =>
    el("option", { value: s, selected: s === client.stage }, STAGE_LABELS[s])));

  const statusSelect = el("select.input", {}, ["lead", "active", "paused", "churned"].map((s) =>
    el("option", { value: s, selected: s === client.status }, s)));

  const notesArea = el("textarea.input", { rows: 4 }, client.notes || "");

  openModal(el("div", {},
    el("div.row", { style: "gap:8px;margin-bottom:6px;flex-wrap:wrap" },
      client.persona && el(`span.persona.${client.persona}`, {}, client.persona),
      client.region && el("span.chip.type", {}, client.region),
      el("span.chip.gold", {}, client.status),
      el("div.spacer"),
      slaChip(client.stage_entered_at + 72 * 3600_000),
    ),
    el("h2", {}, client.company),
    el("div", { style: "color:var(--text-low);margin-top:4px;font-size:13px" },
      `${client.contact_name || "—"} · ${client.email || "—"} · owner ${client.owner_name || "—"}`),

    client.stage_sla &&
      el("div.sla-banner", {
        class: client.stage_sla.state === "breached" ? "bad" : client.stage_sla.state === "ok" ? "good" : "warn",
        style: "margin-top:16px;margin-bottom:0",
      }, `Stage clock: ${client.stage_sla.label}`),

    el("div.form-grid", { style: "margin-top:18px" },
      el("div.field", {}, el("label", {}, "Pipeline stage"), stageSelect),
      el("div.field", {}, el("label", {}, "Status"), statusSelect),
    ),
    el("div.field", {}, el("label", {}, "Notes"), notesArea),

    client.projects.length &&
      el("div", { style: "margin-top:6px" },
        el("div", { style: "font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-2);font-weight:700;margin-bottom:8px" },
          "Projects"),
        client.projects.map((p) =>
          el("div.dep-item", {},
            el("span.chip.gold", {}, p.code),
            el("span", { style: "flex:1" }, p.name),
            el("span", { style: "color:var(--text-low);font-size:11px" }, p.status),
            el("button.btn.xs", { onclick: (e) => { e.stopPropagation(); closeModal(); ctx.navigate("projects", p.id); } }, "Open"),
          )),
      ),

    el("div.row", { style: "justify-content:flex-end;gap:10px;margin-top:20px" },
      ["admin"].includes(ctx.user?.role) &&
        el("button.btn.btn-danger", {
          onclick: async () => {
            const ok = await confirmDialog("Remove client", `Remove ${client.company} from the pipeline?`, { danger: true });
            if (!ok) return;
            try {
              await api.deleteClient(client.id);
              toast("Client removed", "ok");
              closeModal();
              ctx.refreshCurrent();
            } catch (err) { toast(err.message, "err"); }
          },
        }, "Remove"),
      el("button.btn.btn", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn-gold", {
        onclick: async () => {
          try {
            await api.updateClient(client.id, {
              stage: stageSelect.value,
              status: statusSelect.value,
              notes: notesArea.value,
            });
            toast("Client updated", "ok");
            closeModal();
            ctx.refreshCurrent();
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Save"),
    ),
  ), { wide: true });
}

export function openCreateClient(ctx) {
  const f = {
    company: el("input.input", { placeholder: "Company name" }),
    name: el("input.input", { placeholder: "Primary contact" }),
    email: el("input.input", { type: "email", placeholder: "contact@company.com" }),
    persona: el("select.input", {},
      el("option", { value: "" }, "— persona —"),
      el("option", { value: "dreamer" }, "dreamer (wants the vision)"),
      el("option", { value: "enthusiast" }, "enthusiast (ai-forward, wants tools)"),
      el("option", { value: "pessimistic" }, "pessimistic (wants opinions, no hype)")),
    region: el("select.input", {},
      el("option", { value: "" }, "— region —"),
      el("option", { value: "india" }, "india (morning)"),
      el("option", { value: "emea" }, "emea (afternoon)"),
      el("option", { value: "americas" }, "americas (night)")),
    stage: el("select.input", {}, STAGE_ORDER.map((s, i) =>
      el("option", { value: s, selected: i === 0 }, STAGE_LABELS[s]))),
    deal_band: el("select.input", {},
      ["s", "m", "l", "xl"].map((b) => el("option", { value: b }, b.toUpperCase()))),
    notes: el("textarea.input", { rows: 3, placeholder: "Context, positioning notes…" }),
  };

  openModal(el("div", {},
    el("h2", {}, "New ", el("em", {}, "client")),
    el("div", { style: "height:18px" }),
    el("div.form-grid", {},
      el("div.field", {}, el("label", {}, "Company *"), f.company),
      el("div.field", {}, el("label", {}, "Contact"), f.name),
      el("div.field", {}, el("label", {}, "Email"), f.email),
      el("div.field", {}, el("label", {}, "Deal band"), f.deal_band),
      el("div.field", {}, el("label", {}, "Persona"), f.persona),
      el("div.field", {}, el("label", {}, "Region"), f.region),
      el("div.field.full", {}, el("label", {}, "Entry stage"), f.stage),
      el("div.field.full", {}, el("label", {}, "Notes"), f.notes),
    ),
    el("div.row", { style: "justify-content:flex-end;gap:10px" },
      el("button.btn.btn-ghost", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn-gold", {
        onclick: async () => {
          if (!f.company.value.trim()) { toast("Company is required", "warn"); return; }
          try {
            await api.createClient({
              company: f.company.value.trim(),
              name: f.name.value.trim() || f.company.value.trim(),
              email: f.email.value.trim() || null,
              persona: f.persona.value || null,
              region: f.region.value || null,
              stage: f.stage.value,
              deal_band: f.deal_band.value,
              notes: f.notes.value.trim() || null,
            });
            toast("Client added to pipeline", "ok");
            closeModal();
            ctx.refreshCurrent();
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Add client"),
    ),
  ), { wide: true });
}

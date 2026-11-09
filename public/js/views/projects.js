/** Projects list + detail (phases with turnover SLAs, tasks, actions). */
import { api } from "../api.js";
import {
  $, el, mount, fmt, avatar, priorityChip, slaChip, STATUS_LABELS,
  toast, openModal, closeModal, sectionTitle, emptyState,
} from "../ui.js";
import { openTask, openCreateTask } from "./board.js";

export async function renderProjects(ctx) {
  const content = $("#content");
  let projects;
  try {
    projects = await api.projects();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  mount(content, el("div", {},
    el("div.row", { style: "margin-bottom:16px" },
      el("div", { style: "color:var(--text-mid);font-size:13px;flex:1" },
        "Every project boots with the standard delivery phases from the pipeline doc — spec → build → QA → demo → ship → handover, each with its turnover clock."),
      el("button.btn.btn.btn-gold", { onclick: () => openCreateProject(ctx) }, "+ New project"),
    ),
    projects.length
      ? el("div.grid-3", {}, projects.map((p) => projectCard(p, ctx)))
      : el("div.card", {}, emptyState("◇", "No projects yet — create one to bootstrap the phase plan.")),
  ));
}

function projectCard(p, ctx) {
  const progress = p.phases_total ? Math.round((p.phases_done / p.phases_total) * 100) : 0;
  const sla = p.active_due_at ? fmt.sla(p.active_due_at) : null;
  return el("div.card", {
    style: "cursor:pointer",
    onclick: () => ctx.navigate("projects", p.id),
  },
    el("div.row", { style: "gap:8px;margin-bottom:8px" },
      el("span.chip.gold", {}, p.code),
      el("span.chip.type", {}, p.status),
      el("div.spacer"),
      sla && el(`span.chip.sla-${sla.state}`, {}, sla.label),
    ),
    el("div", { style: "font-family:var(--font-display);font-size:19px;font-weight:600;line-height:1.25" }, p.name),
    el("div", { style: "color:var(--text-low);font-size:12.5px;margin-top:4px" },
      `${p.client_name} · ${p.client_company}`),
    el("div.row", { style: "margin-top:14px;gap:8px" },
      priorityChip(p.priority),
      el("span", { style: "font-size:11.5px;color:var(--text-low)" },
        `${p.open_tasks}/${p.total_tasks} open · ${p.phases_done}/${p.phases_total} phases`),
    ),
    el("div.bar-track", { style: "margin-top:11px;height:8px" },
      el("div.bar-fill", { style: `width:${progress}%` })),
    el("div.row", { style: "margin-top:11px;gap:8px" },
      p.lead_name ? avatar(p.lead_name, "#d4af37", "sm") : null,
      el("span", { style: "font-size:11.5px;color:var(--text-low)" },
        p.target_date ? `target ${fmt.date(p.target_date)}` : "no target date"),
      el("div.spacer"),
      el("span", { style: "font-size:11.5px;color:var(--gold-2);font-weight:700" }, `${progress}%`),
    ),
  );
}

export async function renderProjectDetail(id, ctx) {
  const content = $("#content");
  let project;
  try {
    project = await api.project(id);
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const byStatus = {};
  for (const t of project.tasks) (byStatus[t.status] ??= []).push(t);

  const canAdvance = ["admin", "lead"].includes(ctx.user?.role);

  mount(content, el("div.stack", {},
    el("div.card", {},
      el("div.row", { style: "gap:10px;flex-wrap:wrap;margin-bottom:10px" },
        el("button.btn.btn.btn-ghost.sm", { onclick: () => ctx.navigate("projects") }, "← Projects"),
        el("div.spacer"),
        el("span.chip.gold", {}, project.code),
        el("span.chip.type", {}, project.status),
        priorityChip(project.priority),
      ),
      el("div", { style: "font-family:var(--font-display);font-size:28px;font-weight:600" }, project.name),
      el("div", { style: "color:var(--text-low);margin-top:5px;font-size:13.5px" },
        `${project.client_name} · ${project.client_company} · stage ${project.client_stage ? project.client_stage.replace(/_/g, " ") : "—"} · lead ${project.lead_name || "—"}`),
      project.description &&
        el("div.well", { style: "padding:13px 16px;margin-top:14px;color:var(--text-mid);font-size:13.5px;line-height:1.6" },
          project.description),
      el("div.row", { style: "margin-top:14px;gap:10px" },
        el("button.btn.btn.btn-gold", { onclick: () => openCreateTask(ctx, { project_id: project.id }) }, "+ Task in this project"),
        project.repo_url && el("a.btn", { href: project.repo_url, target: "_blank", rel: "noopener" }, "↗ Repository"),
      ),
    ),

    el("div.grid-23", {},
      el("div.stack", {},
        el("div.card", {},
          sectionTitle("Delivery phases", "turnover clocks from pipeline policy"),
          el("div.phase-list", {}, project.phases.map((ph, i) => {
            const isActive = ph.status === "active";
            const isDone = ph.status === "done";
            return el(`div.phase${isActive ? " active" : ""}${isDone ? " done" : ""}`, {},
              el("div.phase-index", {}, isDone ? "✓" : i + 1),
              el("div.phase-info", {},
                el("div.phase-name", {}, ph.name),
                el("div.phase-meta", {},
                  `SLA ${ph.sla_hours >= 24 ? `${ph.sla_hours / 24}d` : `${ph.sla_hours}h`}`,
                  ph.started_at ? ` · started ${fmt.rel(ph.started_at)}` : " · not started",
                  ph.completed_at ? ` · completed ${fmt.rel(ph.completed_at)}` : "",
                ),
              ),
              ph.due_at && !isDone ? slaChip(ph.due_at) : null,
              canAdvance && el("div.row", { style: "gap:6px" },
                ph.status === "pending" &&
                  el("button.btn.btn.xs", { onclick: (e) => { e.stopPropagation(); advance(ctx, project.id, ph.id, "active"); } }, "Start"),
                ph.status === "active" &&
                  el("button.btn.btn.xs.btn-gold", { onclick: (e) => { e.stopPropagation(); advance(ctx, project.id, ph.id, "done"); } }, "Complete"),
                ph.status === "blocked" &&
                  el("button.btn.btn.xs", { onclick: (e) => { e.stopPropagation(); advance(ctx, project.id, ph.id, "active"); } }, "Unblock"),
                ["pending", "active"].includes(ph.status) &&
                  el("button.btn.btn.xs", { onclick: (e) => { e.stopPropagation(); advance(ctx, project.id, ph.id, "blocked"); } }, "Block"),
              ),
            );
          })),
        ),

        el("div.card", {},
          sectionTitle(`Tasks (${project.tasks.length})`),
          project.tasks.length
            ? el("div", {}, [...project.tasks]
                .sort((a, b) => b.rank_score - a.rank_score)
                .map((t) =>
                  el("div.row", {
                    style: "padding:10px 4px;border-bottom:1px solid rgba(255,255,255,.05);cursor:pointer;gap:10px",
                    onclick: () => openTask(t.id, ctx),
                  },
                    el("span.dot", {
                      class: t.status === "done" ? "ok" : t.status === "blocked" ? "bad" : t.status === "in_progress" ? "warn" : "",
                      style: t.status === "done" ? "" : t.status === "in_progress" ? "background:var(--gold-2);box-shadow:0 0 8px var(--gold-2)" : "",
                    }),
                    el("div", { style: "flex:1;min-width:0" },
                      el("div", {
                        style: `font-size:13.5px;font-weight:600;${t.status === "done" ? "text-decoration:line-through;color:var(--text-low)" : ""}`,
                      }, t.title),
                      el("div", { style: "font-size:11px;color:var(--text-low);margin-top:2px" },
                        `${STATUS_LABELS[t.status]} · ${t.assignee_name || "unassigned"} · ${fmt.hrs(t.estimate_hours)}`),
                    ),
                    priorityChip(t.priority),
                    slaChip(t.due_at),
                    t.rank_score > 0 && el("span.tscore", {}, `◆ ${t.rank_score}`),
                  )))
            : emptyState("◇", "No tasks yet"),
        ),
      ),

      el("div.stack", {},
        el("div.card", {},
          sectionTitle("Status split"),
          ["backlog", "todo", "in_progress", "in_review", "blocked", "done"].map((s) => {
            const n = (byStatus[s] || []).length;
            const max = Math.max(1, ...Object.values(byStatus).map((v) => v.length));
            return el("div.bar-row", {},
              el("div.bar-label", {}, STATUS_LABELS[s]),
              el("div.bar-track", {}, el(`div.bar-fill${s === "blocked" ? ".danger" : s === "done" ? ".ok" : ""}`, { style: `width:${(n / max) * 100}%` })),
              el("div.bar-val", {}, String(n)),
            );
          }),
        ),
        el("div.card", {},
          sectionTitle("Budget"),
          el("div.row", { style: "justify-content:space-between;padding:6px 0" },
            el("span", { style: "color:var(--text-low);font-size:12.5px" }, "Estimated hours"),
            el("span", { style: "font-weight:700;color:var(--gold-1)" },
              fmt.hrs(project.tasks.reduce((n, t) => n + (t.estimate_hours || 0), 0))),
          ),
          el("div.row", { style: "justify-content:space-between;padding:6px 0" },
            el("span", { style: "color:var(--text-low);font-size:12.5px" }, "Budget"),
            el("span", { style: "font-weight:700" }, fmt.hrs(project.budget_hours)),
          ),
          el("div.row", { style: "justify-content:space-between;padding:6px 0" },
            el("span", { style: "color:var(--text-low);font-size:12.5px" }, "Target date"),
            el("span", { style: "font-weight:700" }, fmt.date(project.target_date)),
          ),
        ),
      ),
    ),
  ));
}

async function advance(ctx, projectId, phaseId, status) {
  try {
    await api.advancePhase(projectId, phaseId, status);
    toast(`Phase → ${status}`, "ok", 1600);
    renderProjectDetail(projectId, ctx);
  } catch (err) {
    toast(err.message, "err");
  }
}

export function openCreateProject(ctx) {
  const clients = ctx.cache.clients || [];
  if (!clients.length) {
    toast("Add a client first", "warn");
    return;
  }
  const users = (ctx.cache.users || []).filter((u) => ["admin", "lead"].includes(u.role));
  const f = {
    code: el("input.input", { placeholder: "e.g. LEAR-02" }),
    name: el("input.input", { placeholder: "Project name" }),
    client_id: el("select.input", {}, clients.map((c) => el("option", { value: c.id }, c.company))),
    lead_id: el("select.input", {},
      el("option", { value: "" }, "— lead —"),
      users.map((u) => el("option", { value: u.id }, u.name))),
    priority: el("select.input", {}, ["critical", "high", "medium", "low"].map((p) =>
      el("option", { value: p, selected: p === "medium" }, p))),
    budget_hours: el("input.input", { type: "number", min: "0", value: "160" }),
    target_date: el("input.input", { type: "date" }),
    description: el("textarea.input", { rows: 3, placeholder: "Scope, deliverables, repo…" }),
  };

  openModal(el("div", {},
    el("h2", {}, "New ", el("em", {}, "project")),
    el("div", { style: "color:var(--text-low);font-size:12.5px;margin-top:6px" },
      "Bootstraps the 6-phase delivery plan with turnover SLAs automatically."),
    el("div", { style: "height:16px" }),
    el("div.form-grid", {},
      el("div.field", {}, el("label", {}, "Code *"), f.code),
      el("div.field", {}, el("label", {}, "Name *"), f.name),
      el("div.field", {}, el("label", {}, "Client"), f.client_id),
      el("div.field", {}, el("label", {}, "Lead"), f.lead_id),
      el("div.field", {}, el("label", {}, "Priority"), f.priority),
      el("div.field", {}, el("label", {}, "Budget (h)"), f.budget_hours),
      el("div.field.full", {}, el("label", {}, "Target date"), f.target_date),
      el("div.field.full", {}, el("label", {}, "Description"), f.description),
    ),
    el("div.row", { style: "justify-content:flex-end;gap:10px" },
      el("button.btn.btn.btn-ghost", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn.btn-gold", {
        onclick: async () => {
          if (!f.code.value.trim() || !f.name.value.trim()) { toast("Code and name required", "warn"); return; }
          try {
            await api.createProject({
              code: f.code.value.trim().toUpperCase(),
              name: f.name.value.trim(),
              client_id: Number(f.client_id.value),
              lead_id: f.lead_id.value ? Number(f.lead_id.value) : null,
              priority: f.priority.value,
              budget_hours: Number(f.budget_hours.value) || 0,
              target_date: f.target_date.value ? new Date(f.target_date.value).getTime() : null,
              description: f.description.value.trim() || null,
            });
            toast("Project created with phase plan", "ok");
            closeModal();
            ctx.navigate("projects");
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Create project"),
    ),
  ), { wide: true });
}

/** Releases — planned → staging → shipped lifecycle per project. */
import { api } from "../api.js";
import {
  $, el, mount, fmt, sectionTitle, emptyState, toast, openModal, closeModal,
} from "../ui.js";

const STATUS_META = {
  planned: { label: "Planned", color: "var(--text-mid)" },
  staging: { label: "Staging", color: "var(--gold-1)" },
  shipped: { label: "Shipped", color: "var(--ok)" },
  rolled_back: { label: "Rolled back", color: "var(--danger)" },
};

const NEXT = { planned: "staging", staging: "shipped" };

export async function renderReleases(ctx) {
  const content = $("#content");
  let releases;
  try {
    releases = await api.releases();
  } catch (err) {
    mount(content, el("div.card", {}, err.message));
    return;
  }

  const canManage = ["admin", "lead"].includes(ctx.user?.role);
  const isAdmin = ctx.user?.role === "admin";

  const setStatus = async (r, status) => {
    try {
      await api.updateRelease(r.id, { status });
      toast(`${r.name} → ${STATUS_META[status].label}`, "ok");
      ctx.refreshCurrent();
    } catch (err) { toast(err.message, "err"); }
  };

  const remove = async (r) => {
    try {
      await api.deleteRelease(r.id);
      toast("Release removed", "ok");
      ctx.refreshCurrent();
    } catch (err) { toast(err.message, "err"); }
  };

  const row = (r) => {
    const meta = STATUS_META[r.status] || STATUS_META.planned;
    return el("div.row", { style: "padding:11px 14px;gap:13px;border-bottom:1px solid var(--glass-border);flex-wrap:wrap" },
      el("span.dot", { style: `background:${meta.color};box-shadow:0 0 8px ${meta.color}` }),
      el("span", { style: `font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;width:96px;color:${meta.color}` },
        meta.label),
      el("div", { style: "flex:1;min-width:170px" },
        el("div", { style: "font-size:13.5px;font-weight:650" },
          r.name, r.version ? el("em", { style: "color:var(--gold-2);font-style:normal" }, ` ${r.version}`) : null),
        r.notes
          ? el("div", { style: "font-size:11.5px;color:var(--text-low);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:340px", title: r.notes }, r.notes)
          : null),
      r.project_code ? el("span.chip.type", { title: r.project_name }, r.project_code) : null,
      el("span", { style: "font-size:11.5px;color:var(--text-mid)" },
        r.status === "shipped" && r.shipped_at ? fmt.dateTime(r.shipped_at) : fmt.rel(r.created_at)),
      canManage && NEXT[r.status]
        ? el("button.btn.btn-gold.xs", { onclick: () => setStatus(r, NEXT[r.status]) },
            r.status === "planned" ? "→ Staging" : "→ Ship")
        : null,
      canManage && r.status === "shipped"
        ? el("button.btn.btn-danger.xs", { onclick: () => setStatus(r, "rolled_back") }, "Roll back")
        : null,
      canManage && r.status === "rolled_back"
        ? el("button.btn.xs", { onclick: () => setStatus(r, "planned") }, "Re-plan")
        : null,
      isAdmin
        ? el("button.btn.btn-danger.xs", { onclick: () => remove(r) }, "Delete")
        : null,
    );
  };

  mount(content, el("div.stack", {},
    el("div.row", { style: "justify-content:space-between" },
      sectionTitle("Release train", "planned → staging → shipped, SLA-tracked"),
      canManage
        ? el("button.btn.btn-gold", { onclick: () => openCreateRelease(ctx) }, "+ New release")
        : null),
    el("div.card", {},
      releases.length
        ? el("div", { style: "margin-top:4px" }, releases.map(row))
        : emptyState("🚀", "No releases yet — cut the first one")),
  ));
}

function openCreateRelease(ctx) {
  const projects = ctx.cache?.projects?.length ? ctx.cache.projects : [];
  const f = {
    project: el("select.input", {},
      projects.length
        ? projects.map((p) => el("option", { value: String(p.id) }, `${p.code} — ${p.name}`))
        : el("option", { value: "" }, "— no projects yet —")),
    name: el("input.input", { placeholder: "Release name (e.g. First ship)" }),
    version: el("input.input", { placeholder: "v1.0 (optional)" }),
    status: el("select.input", {},
      el("option", { value: "planned" }, "Planned"),
      el("option", { value: "staging" }, "Staging"),
      el("option", { value: "shipped" }, "Shipped")),
    notes: el("textarea.input", { rows: 3, placeholder: "What's in this release…" }),
  };

  openModal(el("div", {},
    el("h2", {}, "New ", el("em", {}, "release")),
    el("div", { style: "height:18px" }),
    el("div.form-grid", {},
      el("div.field.full", {}, el("label", {}, "Project *"), f.project),
      el("div.field", {}, el("label", {}, "Name *"), f.name),
      el("div.field", {}, el("label", {}, "Version"), f.version),
      el("div.field.full", {}, el("label", {}, "Status"), f.status),
      el("div.field.full", {}, el("label", {}, "Notes"), f.notes),
    ),
    el("div.row", { style: "justify-content:flex-end;gap:10px" },
      el("button.btn.btn-ghost", { onclick: closeModal }, "Cancel"),
      el("button.btn.btn-gold", {
        onclick: async () => {
          if (!projects.length) { toast("Create a project first", "warn"); return; }
          if (!f.name.value.trim()) { toast("Release name is required", "warn"); return; }
          try {
            await api.createRelease({
              project_id: Number(f.project.value),
              name: f.name.value.trim(),
              version: f.version.value.trim() || null,
              status: f.status.value,
              notes: f.notes.value.trim() || null,
            });
            toast("Release created", "ok");
            closeModal();
            ctx.refreshCurrent();
          } catch (err) { toast(err.message, "err"); }
        },
      }, "Create release"),
    ),
  ), { wide: true });
}

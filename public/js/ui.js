/** UI kit — DOM helpers, formatters, toasts, modals, tiny charts. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Hyperscript-lite: el("div.card", {onclick}, ...children) */
export function el(spec, attrs = {}, ...children) {
  const [tagPart, ...classes] = spec.split(".");
  const node = document.createElement(tagPart || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = `${node.className} ${v}`.trim();
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k in node && k !== "list" && typeof v !== "object") node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, ...children) {
  clear(node);
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/* ── formatters ─────────────────────────────────────────────────── */

export const fmt = {
  rel(ts) {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    const abs = Math.abs(diff);
    const m = 60_000, h = 3600_000, d = 86400_000;
    const future = diff < 0;
    const u =
      abs < m ? `${Math.max(1, Math.round(abs / 1000))}s`
      : abs < h ? `${Math.round(abs / m)}m`
      : abs < d ? `${Math.round(abs / h)}h`
      : `${Math.round(abs / d)}d`;
    return future ? `in ${u}` : `${u} ago`;
  },
  sla(ts) {
    if (!ts) return { state: "none", label: "—" };
    const ms = ts - Date.now();
    const abs = Math.abs(ms);
    const label =
      abs < 3600_000 ? `${Math.max(1, Math.round(abs / 60_000))}m`
      : abs < 86400_000 ? `${Math.round(abs / 3600_000)}h`
      : `${(abs / 86400_000).toFixed(abs < 3 * 86400_000 ? 1 : 0)}d`;
    if (ms < 0) return { state: "breached", label: `${label} over` };
    if (ms < 4 * 3600_000) return { state: "critical", label: `${label} left` };
    if (ms < 86400_000) return { state: "warning", label: `${label} left` };
    return { state: "ok", label: `${label} left` };
  },
  num(n) {
    if (n == null) return "—";
    return Number(n).toLocaleString();
  },
  hrs(n) {
    if (!n) return "0h";
    return n >= 100 ? `${Math.round(n)}h` : `${Number(n).toFixed(n % 1 ? 1 : 0)}h`;
  },
  date(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  },
  dateTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  },
};

export const STATUS_LABELS = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
};

export const STAGE_LABELS = {
  outreach: "Outreach",
  initial_consultation: "Initial Consultation",
  technical_consultation: "Technical Consultation",
  planning: "Planning",
  kickoff: "Kickoff",
  development: "Development",
  qa: "QA",
  shipping: "Shipping",
  maintenance: "Maintenance",
  won: "Won",
  lost: "Lost",
};

export const STAGE_ORDER = [
  "outreach", "initial_consultation", "technical_consultation", "planning",
  "kickoff", "development", "qa", "shipping", "maintenance", "won",
];

export const STAGE_SLA = {
  outreach: "≤ 3 days",
  initial_consultation: "Plan delta ≤ 3 days",
  technical_consultation: "Same/next meeting",
  planning: "Response ≤ 12–32h",
  kickoff: "Kickoff week",
  development: "Module ≤ 1 day · cycle ≤ 2 wks",
  qa: "QA report ≤ 12h",
  shipping: "Ship ≤ 5 days after demo",
  maintenance: "OTA · uptime · usage",
  won: "—",
};

/* ── atoms ──────────────────────────────────────────────────────── */

export function avatar(name, color, size = "") {
  const initials = String(name || "?")
    .split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return el(`span.avatar${size ? ` ${size}` : ""}`, {
    style: `background:linear-gradient(135deg, ${color || "#e8b923"}, ${shade(color || "#e8b923", -30)})`,
    title: name || "",
  }, initials);
}

function shade(hex, pct) {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export function priorityChip(p) {
  return el(`span.chip.p-${p}`, {}, p);
}

export function slaChip(ts) {
  const s = fmt.sla(ts);
  if (s.state === "none") return null;
  return el(`span.chip.sla-${s.state}`, {}, s.state === "breached" ? `⚠ ${s.label}` : s.label);
}

export function typeChip(t) {
  return el("span.chip.type", {}, t);
}

export function scoreBadge(score) {
  return el("span.tscore", { title: "AI priority score" }, `◆ ${score}`);
}

/* ── toast ──────────────────────────────────────────────────────── */

export function toast(message, kind = "ok", ms = 3200) {
  const root = $("#toast-root");
  const icon = kind === "err" ? "✕" : kind === "warn" ? "⚠" : "◆";
  const node = el(`div.toast.${kind === "err" ? "err" : kind === "warn" ? "" : "ok"}`,
    {}, el("span", { style: "color:var(--gold-2)" }, icon), message);
  root.append(node);
  setTimeout(() => {
    node.style.transition = "all .3s";
    node.style.opacity = "0";
    node.style.transform = "translateX(30px)";
    setTimeout(() => node.remove(), 320);
  }, ms);
}

/* ── modal ──────────────────────────────────────────────────────── */

let modalOnClose = null;

export function openModal(node, { wide = false, onClose } = {}) {
  const root = $("#modal-root");
  const box = $("#modal-box");
  box.className = `modal${wide ? " wide" : ""}`;
  mount(box, node);
  root.classList.add("open");
  modalOnClose = onClose || null;
}

export function closeModal() {
  $("#modal-root").classList.remove("open");
  if (modalOnClose) {
    const fn = modalOnClose;
    modalOnClose = null;
    fn();
  }
}

export function confirmDialog(title, message, { danger = false } = {}) {
  return new Promise((resolve) => {
    const done = (val) => {
      resolve(val); // settle first so onClose's resolve(false) is a no-op
      closeModal();
    };
    openModal(
      el("div", {},
        el("h2", {}, title),
        el("p", { style: "color:var(--text-mid); margin:14px 0 24px; line-height:1.6" }, message),
        el("div.row", { style: "justify-content:flex-end" },
          el("button.btn.btn.btn-ghost", { onclick: () => done(false) }, "Cancel"),
          el("button", {
            class: `btn ${danger ? "btn-danger" : "btn-gold"}`,
            onclick: () => done(true),
          }, danger ? "Delete" : "Confirm"),
        ),
      ),
      { onClose: () => resolve(false) },
    );
  });
}

/* ── charts ─────────────────────────────────────────────────────── */

export function donut(pct, { size = 118, stroke = 11, label = "ON TIME" } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "donut");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.innerHTML = `
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="rgba(255,255,255,0.07)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="url(#goldgrad)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"
      style="transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.3,1)"/>
    <defs>
      <linearGradient id="goldgrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f7e08b"/>
        <stop offset="100%" stop-color="#a8842a"/>
      </linearGradient>
    </defs>
    <text class="donut-center" x="50%" y="48%" text-anchor="middle"
      dominant-baseline="middle" transform="rotate(90 ${size / 2} ${size / 2})">${pct}%</text>
    <text class="donut-sub" x="50%" y="62%" text-anchor="middle"
      transform="rotate(90 ${size / 2} ${size / 2})">${label}</text>`;
  return svg;
}

export function sparkline(items, { valueKey = "count", labelKey = "day", height = 76 } = {}) {
  const max = Math.max(1, ...items.map((i) => i[valueKey]));
  const wrap = el("div.sparkline", { style: `height:${height}px` });
  for (const item of items) {
    const h = Math.max(4, Math.round((item[valueKey] / max) * 100));
    wrap.append(
      el("div.spark-bar", { style: `height:${h}%` },
        el("span.tip", {}, `${item[labelKey]}: ${item[valueKey]}`)),
    );
  }
  if (!items.length) wrap.append(el("div", { style: "color:var(--text-low);font-size:12px" }, "No data yet"));
  return wrap;
}

export function barRow(label, value, max, { kind = "", suffix = "" } = {}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return el("div.bar-row",
    {},
    el("div.bar-label", {}, label),
    el("div.bar-track", {},
      el(`div.bar-fill${kind ? ` ${kind}` : ""}`, { style: `width:${pct}%` })),
    el("div.bar-val", {}, `${value}${suffix}`),
  );
}

export function sectionTitle(text, hint) {
  return el("div.card-title", {}, text, hint ? el("span.hint", {}, hint) : null);
}

export function emptyState(icon, text) {
  return el("div.empty", {}, el("div.big", {}, icon), text);
}

/** Inline markdown-ish renderer (headers, bold, code, lists) for the roadmap doc. */
export function renderMarkdown(md) {
  const root = el("div.markdown");
  const lines = md.split("\n");
  let list = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      list = null;
      continue;
    }
    const inline = (text) => {
      const frag = document.createDocumentFragment();
      const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) frag.append(el("strong", {}, part.slice(2, -2)));
        else if (part.startsWith("`") && part.endsWith("`")) frag.append(el("code", {}, part.slice(1, -1)));
        else frag.append(document.createTextNode(part));
      }
      return frag;
    };
    if (line.startsWith("# ")) {
      list = null;
      root.append(el("h1", {}, line.slice(2)));
    } else if (line.startsWith("## ")) {
      list = null;
      root.append(el("h2", {}, line.slice(3)));
    } else if (/^[-*] /.test(line)) {
      if (!list) {
        list = el("ul");
        root.append(list);
      }
      list.append(el("li", {}, inline(line.slice(2))));
    } else {
      list = null;
      root.append(el("p", {}, inline(line)));
    }
  }
  return root;
}

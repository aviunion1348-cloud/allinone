/** API client — single source of truth for all HTTP calls. */
const TOKEN_KEY = "aurum_token";

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  save(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable — cookie-only mode */
    }
  },
  clear() {
    this.save(null);
  },
};

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  const opts = {
    method,
    credentials: "same-origin",
    headers: {},
  };
  const token = auth.token;
  if (token) opts.headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/v1${path}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    if (res.status === 401 && token) {
      // stale token — drop it so the login screen can take over
      auth.clear();
    }
    const err = data?.error ?? {};
    throw new ApiError(res.status, err.code || "error", err.message || res.statusText, err.details);
  }
  if (res.status === 204) return null;
  return data;
}

export const api = {
  get: (p) => request("GET", p),
  post: (p, b) => request("POST", p, b ?? {}),
  patch: (p, b) => request("PATCH", p, b ?? {}),
  del: (p) => request("DELETE", p),

  // auth
  login: (email, password) => request("POST", "/auth/login", { email, password }),
  logout: () => request("POST", "/auth/logout"),
  me: () => request("GET", "/auth/me"),

  // domain
  dashboard: () => request("GET", "/dashboard"),
  board: (projectId) =>
    request("GET", `/tasks/board${projectId ? `?project_id=${projectId}` : ""}`),
  task: (id) => request("GET", `/tasks/${id}`),
  createTask: (data) => request("POST", "/tasks", data),
  updateTask: (id, patch) => request("PATCH", `/tasks/${id}`, patch),
  moveTask: (id, status, position) => request("POST", `/tasks/${id}/move`, { status, position }),
  deleteTask: (id) => request("DELETE", `/tasks/${id}`),
  comment: (id, body) => request("POST", `/tasks/${id}/comments`, { body }),
  addDep: (id, taskId) => request("POST", `/tasks/${id}/depends-on`, { task_id: taskId }),
  delDep: (id, depId) => request("DELETE", `/tasks/${id}/depends-on/${depId}`),
  assigneeSuggestions: (id) => request("GET", `/tasks/${id}/assignee-suggestions`),

  clients: () => request("GET", "/clients"),
  client: (id) => request("GET", `/clients/${id}`),
  createClient: (d) => request("POST", "/clients", d),
  updateClient: (id, patch) => request("PATCH", `/clients/${id}`, patch),
  deleteClient: (id) => request("DELETE", `/clients/${id}`),
  pipelineStages: () => request("GET", "/pipeline/stages"),

  projects: (q = "") => request("GET", `/projects${q}`),
  project: (id) => request("GET", `/projects/${id}`),
  createProject: (d) => request("POST", "/projects", d),
  updateProject: (id, patch) => request("PATCH", `/projects/${id}`, patch),
  advancePhase: (projectId, phaseId, status) =>
    request("POST", `/projects/${projectId}/phases/${phaseId}/advance`, { status }),

  users: () => request("GET", "/users"),
  workload: () => request("GET", "/users/workload"),

  aiRanks: (limit = 30) => request("GET", `/ai/ranks?limit=${limit}`),
  aiScore: (id) => request("GET", `/ai/score/${id}`),
  aiWeights: () => request("GET", "/ai/weights"),
  setAiWeights: (w) => request("PATCH", "/ai/weights", w),
  recompute: () => request("POST", "/ai/recompute"),

  slaPolicies: () => request("GET", "/sla/policies"),
  slaHealth: () => request("GET", "/sla/health"),
  playbook: () => request("GET", "/playbook"),
  activities: (limit = 40) => request("GET", `/activities?limit=${limit}`),
  roadmap: () => request("GET", "/roadmap"),
};

export { ApiError };

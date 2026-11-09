/** REST API v1 — resource routers. */
import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import {
  requireAuth, requireRole, validate, signToken, setSessionCookie,
} from "../middleware/index.js";
import { HttpError } from "../util/logger.js";
import { config } from "../config.js";
import {
  authService, taskService, clientService, projectService,
  dashboardService, aiService,
} from "../services/index.js";
import * as repo from "../repositories/index.js";
import { listSlaPolicies, turnoverHealth, slaState } from "../domain/sla.js";
import { getWeights, setWeights } from "../domain/ai.js";

export const api = Router();

/* ── health ─────────────────────────────────────────────────────── */
api.get("/health", (_req, res) => {
  res.json({ ok: true, service: "aurum-ops", ts: Date.now() });
});

/* ── auth ───────────────────────────────────────────────────────── */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many attempts" } },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

api.post("/auth/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.validated;
  const user = repo.users.byEmail(email.trim().toLowerCase());
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw HttpError.unauthorized("Invalid credentials");
  if (!user.active) throw HttpError.forbidden("Account disabled");
  setSessionCookie(res, signToken(user));
  const { password_hash, ...safe } = user;
  res.json({ user: safe });
});

api.post("/auth/logout", (req, res) => {
  res.clearCookie(config.cookieName, { path: "/" });
  res.json({ ok: true });
});

api.get("/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

/* ── everything below requires auth ─────────────────────────────── */
api.use(requireAuth);

/* ── dashboard ──────────────────────────────────────────────────── */
api.get("/dashboard", (_req, res) => res.json(dashboardService.summary()));

/* ── users / team ───────────────────────────────────────────────── */
api.get("/users", (_req, res) => res.json(repo.users.list()));
api.get("/users/workload", (_req, res) => res.json(repo.users.workload()));

/* ── clients / pipeline ─────────────────────────────────────────── */
api.get("/clients", (_req, res) => res.json(clientService.list()));
api.get("/clients/:id", (req, res) => {
  const client = clientService.get(Number(req.params.id));
  if (!client) throw HttpError.notFound("Client");
  res.json(client);
});
api.get("/pipeline/stages", (_req, res) =>
  res.json({ counts: clientService.stageCounts(), policies: listSlaPolicies().filter((p) => p.scope === "pipeline") }));

const clientSchema = z.object({
  name: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  contact_name: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  persona: z.enum(["dreamer", "enthusiast", "pessimistic"]).optional().nullable(),
  region: z.enum(["india", "emea", "americas"]).optional().nullable(),
  stage: z.enum([
    "outreach", "initial_consultation", "technical_consultation", "planning",
    "kickoff", "development", "qa", "shipping", "maintenance", "won", "lost",
  ]).optional(),
  status: z.enum(["lead", "active", "paused", "churned"]).optional(),
  deal_band: z.enum(["s", "m", "l", "xl"]).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  owner_id: z.number().int().optional().nullable(),
});

api.post("/clients", requireRole("admin", "lead"), validate(clientSchema), (req, res) => {
  res.status(201).json(clientService.create(req.validated, req.user.id));
});
api.patch("/clients/:id", requireRole("admin", "lead"), (req, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) throw HttpError.badRequest("Invalid patch", parsed.error.flatten());
  const client = clientService.update(Number(req.params.id), parsed.data, req.user.id);
  if (!client) throw HttpError.notFound("Client");
  res.json(client);
});
api.delete("/clients/:id", requireRole("admin"), (req, res) => {
  const changes = clientService.remove(Number(req.params.id), req.user.id);
  if (!changes) throw HttpError.notFound("Client");
  res.json({ ok: true });
});

/* ── projects ───────────────────────────────────────────────────── */
api.get("/projects", (req, res) =>
  res.json(projectService.list({
    status: req.query.status,
    client_id: req.query.client_id ? Number(req.query.client_id) : undefined,
  })));

api.get("/projects/:id", (req, res) => {
  const project = projectService.get(Number(req.params.id));
  if (!project) throw HttpError.notFound("Project");
  res.json(project);
});

const projectSchema = z.object({
  code: z.string().min(2).max(24).regex(/^[A-Za-z0-9-_]+$/, "code must be alphanumeric"),
  name: z.string().min(2).max(160),
  description: z.string().max(4000).optional().nullable(),
  client_id: z.number().int(),
  lead_id: z.number().int().optional().nullable(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  start_date: z.number().int().optional().nullable(),
  target_date: z.number().int().optional().nullable(),
  budget_hours: z.number().min(0).optional(),
  repo_url: z.string().url().optional().nullable().or(z.literal("")),
});

api.post("/projects", requireRole("admin", "lead"), validate(projectSchema), (req, res) => {
  res.status(201).json(projectService.create(req.validated, req.user.id));
});
api.patch("/projects/:id", requireRole("admin", "lead"), (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) throw HttpError.badRequest("Invalid patch", parsed.error.flatten());
  const project = projectService.update(Number(req.params.id), parsed.data, req.user.id);
  if (!project) throw HttpError.notFound("Project");
  res.json(project);
});
api.delete("/projects/:id", requireRole("admin"), (req, res) => {
  const changes = projectService.remove(Number(req.params.id), req.user.id);
  if (!changes) throw HttpError.notFound("Project");
  res.json({ ok: true });
});
api.post("/projects/:id/phases/:phaseId/advance", requireRole("admin", "lead"), (req, res) => {
  const status = z.enum(["pending", "active", "blocked", "done"]).parse(req.body?.status);
  const phase = projectService.advancePhase(Number(req.params.phaseId), status, req.user.id);
  if (!phase) throw HttpError.notFound("Phase");
  res.json(phase);
});

/* ── tasks ──────────────────────────────────────────────────────── */
api.get("/tasks", (req, res) => {
  const filters = {};
  for (const k of ["project_id", "assignee_id", "status", "priority", "type", "phase_id"]) {
    if (req.query[k]) filters[k] = ["project_id", "assignee_id", "phase_id"].includes(k)
      ? Number(req.query[k]) : req.query[k];
  }
  if (req.query.q) filters.q = String(req.query.q);
  res.json(taskService.list(filters));
});

api.get("/tasks/board", (req, res) => {
  const board = repo.tasks.board({
    project_id: req.query.project_id ? Number(req.query.project_id) : undefined,
  });
  res.json(board);
});

api.get("/tasks/:id", (req, res) => {
  const task = taskService.get(Number(req.params.id));
  if (!task) throw HttpError.notFound("Task");
  res.json(task);
});

const taskSchema = z.object({
  project_id: z.number().int(),
  phase_id: z.number().int().optional().nullable(),
  assignee_id: z.number().int().optional().nullable(),
  title: z.string().min(1).max(240),
  description: z.string().max(8000).optional().nullable(),
  type: z.enum(["feature", "bug", "qa", "research", "chore", "doc"]).optional(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "blocked", "done"]).optional(),
  priority: z.enum(["critical", "high", "medium", "low"]).optional(),
  estimate_hours: z.number().min(0).max(1000).optional(),
  due_at: z.number().int().optional().nullable(),
  labels: z.array(z.string().max(32)).max(12).optional(),
  position: z.number().optional(),
});

api.post("/tasks", validate(taskSchema), (req, res) => {
  res.status(201).json(taskService.create({ ...req.validated, reporter_id: req.user.id }, req.user.id));
});

api.patch("/tasks/:id", (req, res) => {
  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success) throw HttpError.badRequest("Invalid patch", parsed.error.flatten());
  const task = taskService.update(Number(req.params.id), parsed.data, req.user.id);
  if (!task) throw HttpError.notFound("Task");
  res.json(task);
});

const moveSchema = z.object({
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "blocked", "done"]),
  position: z.number().optional(),
});
api.post("/tasks/:id/move", validate(moveSchema), (req, res) => {
  const task = taskService.move(
    Number(req.params.id), req.validated.status, req.validated.position, req.user.id,
  );
  if (!task) throw HttpError.notFound("Task");
  res.json(task);
});

api.delete("/tasks/:id", (req, res) => {
  const role = req.user.role;
  if (!["admin", "lead"].includes(role)) throw HttpError.forbidden();
  const changes = taskService.remove(Number(req.params.id), req.user.id);
  if (!changes) throw HttpError.notFound("Task");
  res.json({ ok: true });
});

api.post("/tasks/:id/comments", validate(z.object({ body: z.string().min(1).max(4000) })), (req, res) => {
  const comment = taskService.comment(Number(req.params.id), req.user.id, req.validated.body);
  res.status(201).json(comment);
});

api.post("/tasks/:id/depends-on", validate(z.object({ task_id: z.number().int() })), (req, res) => {
  taskService.addDependency(Number(req.params.id), req.validated.task_id, req.user.id);
  res.status(201).json({ ok: true });
});
api.delete("/tasks/:id/depends-on/:depId", (req, res) => {
  taskService.removeDependency(Number(req.params.id), Number(req.params.depId), req.user.id);
  res.json({ ok: true });
});
api.get("/tasks/:id/assignee-suggestions", (req, res) => {
  res.json(taskService.suggestAssignees(Number(req.params.id)));
});

/* ── AI ─────────────────────────────────────────────────────────── */
api.get("/ai/ranks", (req, res) =>
  res.json(aiService.ranks(req.query.limit ? Number(req.query.limit) : 30)));
api.get("/ai/score/:id", (req, res) => {
  const result = aiService.scoreTask(Number(req.params.id));
  if (!result) throw HttpError.notFound("Task");
  res.json(result);
});
api.get("/ai/weights", (_req, res) => res.json(getWeights()));
api.patch("/ai/weights", requireRole("admin", "lead"), (req, res) => {
  const parsed = z.record(z.number().min(0).max(1)).safeParse(req.body);
  if (!parsed.success) throw HttpError.badRequest("Weights must be numeric 0..1");
  res.json(setWeights(parsed.data));
});
api.post("/ai/recompute", requireRole("admin", "lead"), (_req, res) => {
  res.json({ ranked: taskService.rank().length });
});

/* ── SLA / turnover ─────────────────────────────────────────────── */
api.get("/sla/policies", (_req, res) => res.json(listSlaPolicies()));
api.get("/sla/health", (_req, res) => res.json(turnoverHealth()));
api.get("/sla/task/:id", (req, res) => {
  const task = repo.tasks.byId(Number(req.params.id));
  if (!task) throw HttpError.notFound("Task");
  res.json({ due_at: task.due_at, sla: slaState(task.due_at) });
});

/* ── activity ───────────────────────────────────────────────────── */
api.get("/activities", (req, res) =>
  res.json(repo.activities.recent(req.query.limit ? Number(req.query.limit) : 40)));

/* ── roadmap (Excalidraw pipeline document) ─────────────────────── */
api.get("/roadmap", async (_req, res) => {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const docPath = path.join(config.root, "docs", "pipeline.md");
  let markdown = null;
  try {
    markdown = await readFile(docPath, "utf8");
  } catch {
    /* not synced yet */
  }
  res.json({
    excalidraw_url: config.excalidrawUrl,
    markdown,
    synced_at: markdown ? Date.now() : null,
    phases: repo.projects.list().flatMap((p) =>
      repo.phases.forProject(p.id).map((ph) => ({
        ...ph,
        project_code: p.code,
        project_name: p.name,
        sla: slaState(ph.due_at),
      })),
    ),
  });
});

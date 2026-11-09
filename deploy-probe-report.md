# Deploy probe — https://allinone-two-nu.vercel.app

_run at 2026-11-09T08:40:34.854Z_

200  399ms    GET / (static shell)
     contains new copy: true
200  115ms    GET /css/app.css
200  103ms    GET /js/app.js
200  105ms    GET /js/views/dashboard.js
200  114ms    GET /api/v1/health
200  254ms    POST /api/v1/auth/login
     token length: 215
200  113ms    GET /auth/me
200  105ms    GET /dashboard
200  101ms    GET /tasks/board
200  103ms    GET /clients
200  106ms    GET /projects
200  104ms    GET /ai/ranks?limit=30
200  109ms    GET /sla/health
200  104ms    GET /playbook
200  107ms    GET /roadmap
200  106ms    GET /users/workload
200  107ms    GET /pipeline/stages
200  100ms    GET /activities?limit=10

dashboard body is NOT JSON: /** Dashboard view — KPIs, turnover health, AI queue, workload, activity. */
import { api } from "../api.js";
import {
  $, el, mount, clear, fmt, avatar, priorityChip, slaChip, scoreBadge,
  donut, sparkline, barRow, sectionTitle, emptyState, toast, openModal,
  closeModal, STATUS_LABELS, STAGE_LAB

18 probes, 0 non-200

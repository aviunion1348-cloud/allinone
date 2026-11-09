# Deploy probe — https://allinone-two-nu.vercel.app

_run at 2026-11-09T09:01:25.099Z_

200  1040ms   GET / (static shell)
     contains new copy: true
200  34ms     GET /css/app.css
200  52ms     GET /js/app.js
200  33ms     GET /js/views/dashboard.js
200  33ms     GET /api/v1/health
200  247ms    POST /api/v1/auth/login
     token length: 215
200  25ms     GET /auth/me
200  36ms     GET /dashboard
200  36ms     GET /tasks/board
200  29ms     GET /clients
200  29ms     GET /projects
200  31ms     GET /ai/ranks?limit=30
200  26ms     GET /sla/health
200  29ms     GET /playbook
200  29ms     GET /roadmap
200  34ms     GET /users/workload
200  28ms     GET /pipeline/stages
200  26ms     GET /activities?limit=10

### response bodies (first 140 chars)
- GET /auth/me → {"user":{"id":1,"email":"avi@aurum.internal","name":"Avi","role":"admin","title":"Founder / QA lead","color":"#e8b923","capacity_hours_week"
- GET /dashboard → {"kpis":{"active_projects":0,"open_tasks":0,"wip":0,"done_7d":0,"overdue":0,"leads":0,"pipeline_active":0,"open_hours":0,"compliance_pct":10
- GET /tasks/board → {"backlog":[],"todo":[],"in_progress":[],"in_review":[],"blocked":[],"done":[]}
- GET /clients → []
- GET /projects → []
- GET /ai/ranks?limit=30 → []
- GET /sla/health → {"phases":[],"breachedPhases":[],"atRiskPhases":[],"breachedTasks":[],"dueToday":[],"compliance":{"onTime":0,"total":0,"pct":100}}
- GET /playbook → {"personas":[{"key":"dreamer","label":"The Dreamer","color":"#c792ea","who":"Forward towards full automation; wowed by the idea of a Jarvis-
- GET /roadmap → {"excalidraw_url":"https://excalidraw.com/#json=_z6CsPYBItOKkslJ_wN30,tWCP-uOrZB1_YFF7Qr03Wg","markdown":null,"synced_at":null,"phases":[]}
- GET /users/workload → [{"id":1,"name":"Avi","role":"admin","color":"#e8b923","capacity_hours_week":40,"open_tasks":0,"wip":0,"open_hours":0},{"id":2,"name":"HoE",
- GET /pipeline/stages → {"counts":[],"policies":[{"key":"plan_delta","name":"Consultation → Plan","scope":"pipeline","hours":72,"value":null,"unit":"hours","hard":1
- GET /activities?limit=10 → []

dashboard shape: kpis=11 byStatus=0 queue=0 activities=0 breaches=0

18 probes, 0 non-200

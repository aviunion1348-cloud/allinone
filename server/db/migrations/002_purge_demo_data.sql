-- One-time purge of the demo filler shipped in earlier seeds.
-- Keeps users, SLA policies, settings and all Excalidraw-derived reference
-- data; removes invented clients / projects / tasks / activity so the
-- workspace starts empty and is filled with real engagement data.
-- Order matters: projects.client_id is ON DELETE RESTRICT, so projects
-- must go before clients. Deleting projects cascades phases, tasks,
-- task_dependencies and comments.
DELETE FROM activities;
DELETE FROM projects;
DELETE FROM clients;

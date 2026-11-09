-- Drop the generic demo viewer account from databases created by older
-- seeds. Fresh databases never create it (see seed.js roster).
DELETE FROM users WHERE email = 'viewer@aurum.internal';

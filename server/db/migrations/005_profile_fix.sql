-- Profile correction: the admin account is not the founder/lead.
UPDATE users SET title = 'QA' WHERE lower(email) = 'avi@aurum.internal';

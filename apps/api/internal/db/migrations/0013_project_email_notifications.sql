-- See docs/decisions/0007-email-notifications-smtp-relay.md.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smtp_host TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smtp_port INT NOT NULL DEFAULT 587;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smtp_username TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smtp_password TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS smtp_from_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notification_recipients TEXT;

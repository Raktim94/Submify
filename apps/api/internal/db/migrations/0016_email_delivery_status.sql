-- Latest email-notification attempt per project. See
-- docs/decisions/0007-email-notifications-smtp-relay.md.
-- 'accepted' = the SMTP relay accepted the message, NOT inbox delivery.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS email_last_status TEXT
    CHECK (email_last_status IN ('pending', 'accepted', 'failed'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS email_last_status_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS email_last_error TEXT;

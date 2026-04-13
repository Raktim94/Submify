-- Per-user profile and optional Telegram + S3 (large uploads / notifications).
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS s3_endpoint TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS s3_access_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS s3_secret_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS s3_bucket TEXT;

UPDATE users
SET full_name = COALESCE(NULLIF(TRIM(full_name), ''), split_part(email, 1, '@'))
WHERE full_name IS NULL OR TRIM(COALESCE(full_name, '')) = '';

UPDATE users SET phone = COALESCE(phone, '') WHERE phone IS NULL;

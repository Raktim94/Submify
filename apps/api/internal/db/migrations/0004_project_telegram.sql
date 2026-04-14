-- Project-level Telegram credentials so each project can notify separately.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

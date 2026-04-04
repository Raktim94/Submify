CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_api_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_configs (
  id INT PRIMARY KEY,
  s3_endpoint TEXT NOT NULL,
  s3_access_key TEXT NOT NULL,
  s3_secret_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  telegram_bot_token TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  admin_password_hash TEXT NOT NULL,
  update_available BOOLEAN NOT NULL DEFAULT FALSE,
  latest_version TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_public_api_key ON projects(public_api_key);
CREATE INDEX IF NOT EXISTS idx_submissions_project_created_at ON submissions(project_id, created_at DESC);

-- Project-level S3 credentials so uploads can be isolated per project.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS s3_endpoint TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS s3_access_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS s3_secret_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS s3_bucket TEXT;

ALTER TABLE workflow_step_idempotency
  ADD COLUMN IF NOT EXISTS lease_token CHAR(36) NULL AFTER execution_status,
  ADD COLUMN IF NOT EXISTS attempt_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER lease_token,
  ADD COLUMN IF NOT EXISTS last_attempted_at DATETIME NULL AFTER attempt_count,
  ADD COLUMN IF NOT EXISTS pending_expires_at DATETIME NULL AFTER last_attempted_at;

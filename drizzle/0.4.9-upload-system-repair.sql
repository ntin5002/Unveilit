-- Photo Delivery 0.4.9 — Upload System Repair
-- Idempotent PostgreSQL reference migration. Drizzle db:push can also apply the schema.

ALTER TABLE photo_uploads ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE photo_uploads ADD COLUMN IF NOT EXISTS uploaded_at timestamptz;
ALTER TABLE photo_uploads ADD COLUMN IF NOT EXISTS verification_started_at timestamptz;
ALTER TABLE photo_uploads ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE photo_uploads ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'QUEUED';
ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0;
ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS worker_version text;
ALTER TABLE photo_processing_jobs ADD COLUMN IF NOT EXISTS failed_at timestamptz;

UPDATE photo_processing_jobs
SET stage = CASE
  WHEN status = 'completed' THEN 'COMPLETED'
  WHEN status = 'failed' THEN 'FAILED'
  WHEN status = 'processing' THEN 'PROCESSING'
  WHEN status = 'cancelled' THEN 'CANCELLED'
  ELSE COALESCE(NULLIF(stage, ''), 'QUEUED')
END,
progress_percent = CASE
  WHEN status = 'completed' THEN 100
  ELSE LEAST(99, GREATEST(0, COALESCE(progress_percent, 0)))
END;

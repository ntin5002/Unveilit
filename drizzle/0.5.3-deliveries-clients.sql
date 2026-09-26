-- Photo Delivery 0.5.3 — Deliveries + Clients reliability
-- Apply to the Photo Delivery database only.

ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS ready_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS download_token_hash text;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS download_token_hint text;
CREATE INDEX IF NOT EXISTS deliveries_organization_status_idx ON deliveries (organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_download_token_hash_uq ON deliveries (download_token_hash);

CREATE TABLE IF NOT EXISTS delivery_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  storage_provider text NOT NULL DEFAULT 'r2',
  storage_key text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/zip',
  filename text NOT NULL,
  file_size bigint,
  checksum text,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_assets_delivery_uq ON delivery_assets (delivery_id);
CREATE INDEX IF NOT EXISTS delivery_assets_organization_idx ON delivery_assets (organization_id);

CREATE TABLE IF NOT EXISTS delivery_package_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  stage text NOT NULL DEFAULT 'QUEUED',
  progress_percent integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  locked_at timestamptz,
  last_heartbeat_at timestamptz,
  locked_by text,
  worker_version text,
  last_error text,
  failed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_package_jobs_delivery_uq ON delivery_package_jobs (delivery_id);
CREATE INDEX IF NOT EXISTS delivery_package_jobs_claim_idx ON delivery_package_jobs (status, available_at);
CREATE INDEX IF NOT EXISTS delivery_package_jobs_organization_idx ON delivery_package_jobs (organization_id);

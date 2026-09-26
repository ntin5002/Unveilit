CREATE TABLE IF NOT EXISTS link_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  created_by_account_id uuid NOT NULL,
  gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  provider text NOT NULL,
  source_url text NOT NULL,
  source_name text,
  source_kind text NOT NULL DEFAULT 'folder',
  status text NOT NULL DEFAULT 'queued',
  stage text NOT NULL DEFAULT 'QUEUED',
  total_files integer NOT NULL DEFAULT 0,
  imported_files integer NOT NULL DEFAULT 0,
  skipped_files integer NOT NULL DEFAULT 0,
  failed_files integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  imported_bytes bigint NOT NULL DEFAULT 0,
  skip_duplicates boolean NOT NULL DEFAULT true,
  start_processing boolean NOT NULL DEFAULT true,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS link_import_jobs_org_created_idx ON link_import_jobs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS link_import_jobs_status_idx ON link_import_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS link_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES link_import_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  external_id text NOT NULL,
  filename text NOT NULL,
  relative_path text,
  mime_type text NOT NULL,
  file_size bigint,
  modified_at timestamptz,
  checksum text,
  provider_metadata jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS link_import_items_job_external_uq ON link_import_items(job_id, external_id);
CREATE INDEX IF NOT EXISTS link_import_items_job_status_idx ON link_import_items(job_id, status);
CREATE INDEX IF NOT EXISTS link_import_items_org_external_idx ON link_import_items(organization_id, external_id);

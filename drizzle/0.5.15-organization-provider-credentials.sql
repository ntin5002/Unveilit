-- Photo Delivery 0.5.15 — Organization-scoped provider application credentials
-- Photo DB only. Platform Core / Signative schema is unchanged.
CREATE TABLE IF NOT EXISTS integration_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  provider text NOT NULL,
  configured_by_account_id uuid NOT NULL,
  encrypted_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_provider_credentials_org_provider_uq
  ON integration_provider_credentials (organization_id, provider);

CREATE INDEX IF NOT EXISTS integration_provider_credentials_org_idx
  ON integration_provider_credentials (organization_id);

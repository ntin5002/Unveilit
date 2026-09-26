-- Photo Delivery 0.5.5 — Integrations + Notifications + Settings
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  appearance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_org_account_uq ON user_preferences (organization_id, account_id);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  recipient_account_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  resource_type text,
  resource_id uuid,
  action_url text,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON notifications (recipient_account_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_org_recipient_read_idx ON notifications (organization_id, recipient_account_id, is_read);

CREATE TABLE IF NOT EXISTS integration_secrets (
  integration_id uuid PRIMARY KEY REFERENCES integrations(id) ON DELETE CASCADE,
  encrypted_payload text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Remove the pre-0.5.5 fake local integration row; real OAuth is required now.
DELETE FROM integrations WHERE account_name = 'Local Demo Dropbox' AND provider = 'dropbox';

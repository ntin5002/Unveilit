-- Photo Delivery 0.5.7 — Photo-owned customer commerce.
-- PLATFORM CORE IS UNCHANGED. Subscription/billing-account ownership remains in Platform Core.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS guest_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS purchaser_name text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS purchaser_email text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token_hash text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS public_token_hint text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_provider text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_session_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_expires_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE INDEX IF NOT EXISTS orders_organization_status_idx ON orders(organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_uq ON orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_public_token_hash_uq ON orders(public_token_hash);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_payment_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_url text;
CREATE INDEX IF NOT EXISTS payments_provider_payment_idx ON payments(provider, provider_payment_id);

ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS source_order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'locked';
ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS granted_by_account_id uuid;
ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS revoked_by_account_id uuid;
ALTER TABLE gallery_entitlements ADD COLUMN IF NOT EXISTS revoke_reason text;

ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE payment_webhook_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

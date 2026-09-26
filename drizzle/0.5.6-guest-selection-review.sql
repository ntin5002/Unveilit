CREATE TABLE IF NOT EXISTS guest_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  guest_key text NOT NULL,
  guest_label text NOT NULL DEFAULT 'Guest',
  status text NOT NULL DEFAULT 'pending',
  photographer_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_selections_gallery_photo_guest_uq ON guest_selections(gallery_id, photo_id, guest_key);
CREATE INDEX IF NOT EXISTS guest_selections_org_gallery_idx ON guest_selections(organization_id, gallery_id);
CREATE INDEX IF NOT EXISTS guest_selections_photo_idx ON guest_selections(photo_id);

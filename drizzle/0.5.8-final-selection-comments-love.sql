-- Photo Delivery 0.5.8 — guest proofing: Love, comments, final submission/revision rounds.
ALTER TABLE guest_selections ADD COLUMN IF NOT EXISTS loved boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS guest_selection_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  guest_key text NOT NULL,
  guest_label text NOT NULL DEFAULT 'Guest',
  round_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'submitted',
  selected_count integer NOT NULL DEFAULT 0,
  loved_count integer NOT NULL DEFAULT 0,
  snapshot jsonb,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reopened_at timestamptz,
  reopened_by_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_selection_submissions_gallery_guest_round_uq ON guest_selection_submissions(gallery_id, guest_key, round_number);
CREATE INDEX IF NOT EXISTS guest_selection_submissions_gallery_status_idx ON guest_selection_submissions(gallery_id, status);

CREATE TABLE IF NOT EXISTS photo_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  gallery_id uuid NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  guest_key text NOT NULL,
  guest_label text NOT NULL DEFAULT 'Guest',
  author_type text NOT NULL DEFAULT 'guest',
  author_account_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_comments_gallery_guest_idx ON photo_comments(gallery_id, guest_key);
CREATE INDEX IF NOT EXISTS photo_comments_photo_idx ON photo_comments(photo_id);

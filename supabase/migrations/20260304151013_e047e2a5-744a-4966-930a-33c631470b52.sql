
-- Alter kommo_notifications to match user's schema
-- Drop extra columns not in user's schema
ALTER TABLE public.kommo_notifications DROP COLUMN IF EXISTS contact_name;
ALTER TABLE public.kommo_notifications DROP COLUMN IF EXISTS contact_email;
ALTER TABLE public.kommo_notifications DROP COLUMN IF EXISTS status_name;
ALTER TABLE public.kommo_notifications DROP COLUMN IF EXISTS responsible_user;
ALTER TABLE public.kommo_notifications DROP COLUMN IF EXISTS source;

-- Rename columns to match user's schema
ALTER TABLE public.kommo_notifications RENAME COLUMN contact_phone TO phone;
ALTER TABLE public.kommo_notifications RENAME COLUMN pipeline_name TO pipeline_stage;
ALTER TABLE public.kommo_notifications RENAME COLUMN is_read TO read;

-- Make lead_name NOT NULL with a default
ALTER TABLE public.kommo_notifications ALTER COLUMN lead_name SET NOT NULL;
ALTER TABLE public.kommo_notifications ALTER COLUMN lead_name SET DEFAULT 'Unknown Lead';

-- Add index for fast unread queries
CREATE INDEX IF NOT EXISTS idx_kommo_notifications_read
  ON public.kommo_notifications(read, created_at DESC);

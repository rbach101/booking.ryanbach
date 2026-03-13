-- Add approval flow to demo signups
ALTER TABLE public.demo_signups
  ADD COLUMN IF NOT EXISTS approval_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_demo_signups_approval_token ON public.demo_signups (approval_token);
CREATE INDEX IF NOT EXISTS idx_demo_signups_status ON public.demo_signups (status);

-- Debug logs table for runtime instrumentation (dev + prod)
CREATE TABLE IF NOT EXISTS public.debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  location text,
  message text,
  data jsonb DEFAULT '{}',
  hypothesis_id text
);

CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON public.debug_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_debug_logs_location ON public.debug_logs (location);

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;

-- Allow insert from anon (public booking flow) and authenticated
CREATE POLICY "Allow insert debug logs"
  ON public.debug_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only staff/admins can read (avoid exposing logs to public)
CREATE POLICY "Staff can read debug logs"
  ON public.debug_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'staff'))
  );

COMMENT ON TABLE public.debug_logs IS 'Runtime debug instrumentation. Export via Supabase SQL Editor or Lovable when needed.';

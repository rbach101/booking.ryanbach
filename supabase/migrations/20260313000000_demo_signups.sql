-- Table to track demo access requests (business owners interested in trying the platform)
CREATE TABLE public.demo_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  business_name text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_signups_email ON public.demo_signups (email);
CREATE INDEX idx_demo_signups_created ON public.demo_signups (created_at DESC);

-- RLS
ALTER TABLE public.demo_signups ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public landing page)
CREATE POLICY "Anyone can insert demo signups" ON public.demo_signups FOR INSERT TO public WITH CHECK (true);

-- Admins can view
CREATE POLICY "Admins can view demo signups" ON public.demo_signups FOR SELECT TO public USING (
  has_role(auth.uid(), 'admin'::app_role)
);

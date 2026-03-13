
CREATE TABLE public.baa_signatures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_title TEXT,
  organization_name TEXT,
  signature_data TEXT NOT NULL,
  signed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  baa_version TEXT NOT NULL DEFAULT '1.0',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.baa_signatures ENABLE ROW LEVEL SECURITY;

-- Users can view their own BAA signatures
CREATE POLICY "Users can view own BAA signatures" ON public.baa_signatures
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own BAA signature
CREATE POLICY "Users can sign BAA" ON public.baa_signatures
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins can view all BAA signatures
CREATE POLICY "Admins can view all BAA signatures" ON public.baa_signatures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );


CREATE TABLE public.kommo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subdomain text NOT NULL,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  connected_by uuid REFERENCES auth.users(id),
  is_connected boolean DEFAULT false
);

ALTER TABLE public.kommo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage kommo connections"
ON public.kommo_connections
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

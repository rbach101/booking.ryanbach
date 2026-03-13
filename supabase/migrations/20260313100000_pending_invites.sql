-- Pending user invites: require Ryan's approval before credentials are activated
CREATE TABLE public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  practitioner_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL,
  temp_password text NOT NULL,
  approval_token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_pending_invites_status ON public.pending_invites (status);
CREATE INDEX idx_pending_invites_approval_token ON public.pending_invites (approval_token);
CREATE INDEX idx_pending_invites_email ON public.pending_invites (email);

-- RLS
ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage
CREATE POLICY "Admins can view pending invites" ON public.pending_invites FOR SELECT TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert pending invites" ON public.pending_invites FOR INSERT TO public
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update pending invites" ON public.pending_invites FOR UPDATE TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

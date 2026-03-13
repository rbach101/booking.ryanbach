
-- Create kommo_notifications table for iMessage/Kommo integration
CREATE TABLE public.kommo_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id TEXT,
  lead_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  pipeline_name TEXT,
  status_name TEXT,
  responsible_user TEXT,
  source TEXT DEFAULT 'kommo',
  raw_payload JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.kommo_notifications ENABLE ROW LEVEL SECURITY;

-- Staff/admin can view
CREATE POLICY "Staff can view kommo notifications"
  ON public.kommo_notifications FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Staff/admin can update (mark as read)
CREATE POLICY "Staff can update kommo notifications"
  ON public.kommo_notifications FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Anyone can insert (webhook is unauthenticated)
CREATE POLICY "Webhook can insert kommo notifications"
  ON public.kommo_notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.kommo_notifications;


CREATE TABLE public.kommo_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  contact_id text,
  direction text NOT NULL DEFAULT 'incoming',
  message_text text NOT NULL,
  sender_name text,
  kommo_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kommo_messages_chat_id ON public.kommo_messages (chat_id);
CREATE INDEX idx_kommo_messages_contact_id ON public.kommo_messages (contact_id);

ALTER TABLE public.kommo_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view kommo messages"
  ON public.kommo_messages FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "System can insert kommo messages"
  ON public.kommo_messages FOR INSERT
  WITH CHECK (true);

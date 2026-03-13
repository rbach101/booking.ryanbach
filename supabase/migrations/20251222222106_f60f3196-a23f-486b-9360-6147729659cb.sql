-- Create SMS messages table to track customer communications
CREATE TABLE public.sms_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound', -- 'outbound' or 'inbound'
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
  sent_by UUID,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  twilio_sid TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;

-- Staff can view all SMS messages
CREATE POLICY "Staff can view SMS messages"
ON public.sms_messages
FOR SELECT
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Staff can send SMS messages
CREATE POLICY "Staff can send SMS messages"
ON public.sms_messages
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sms_messages;
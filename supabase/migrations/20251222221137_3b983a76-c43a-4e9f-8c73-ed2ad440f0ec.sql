-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- 'approval_request', 'booking_approved', 'booking_declined', 'message', etc.
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Admins and staff can insert notifications
CREATE POLICY "Staff can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create internal messages table
CREATE TABLE public.internal_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  recipient_id UUID, -- NULL means broadcast to all staff
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- Staff can view messages sent to them or by them
CREATE POLICY "Staff can view their messages"
ON public.internal_messages
FOR SELECT
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')) 
  AND (sender_id = auth.uid() OR recipient_id = auth.uid() OR recipient_id IS NULL)
);

-- Staff can send messages
CREATE POLICY "Staff can send messages"
ON public.internal_messages
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Staff can update their received messages (mark as read)
CREATE POLICY "Staff can update their messages"
ON public.internal_messages
FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
  AND (recipient_id = auth.uid() OR recipient_id IS NULL)
);

-- Add phone column to practitioners if not exists
ALTER TABLE public.practitioners 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Enable realtime for notifications and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
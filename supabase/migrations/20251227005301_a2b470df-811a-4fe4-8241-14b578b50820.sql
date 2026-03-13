-- Create notification_settings table for storing notification preferences
CREATE TABLE public.notification_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL UNIQUE,
  event_label TEXT NOT NULL,
  event_description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  email_subject_template TEXT,
  email_body_template TEXT,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  sms_template TEXT,
  send_to_client BOOLEAN NOT NULL DEFAULT true,
  send_to_staff BOOLEAN NOT NULL DEFAULT true,
  timing_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view notification settings
CREATE POLICY "Admins can view notification settings" 
ON public.notification_settings 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update notification settings
CREATE POLICY "Admins can update notification settings" 
ON public.notification_settings 
FOR UPDATE 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert notification settings
CREATE POLICY "Admins can insert notification settings" 
ON public.notification_settings 
FOR INSERT 
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_notification_settings_updated_at
BEFORE UPDATE ON public.notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default notification settings for all event types
INSERT INTO public.notification_settings (event_type, event_label, event_description, category, email_enabled, sms_enabled, send_to_client, send_to_staff, timing_minutes, email_subject_template, sms_template) VALUES
-- Booking Events
('booking_confirmation', 'Booking Confirmation', 'Sent immediately when a booking is confirmed', 'bookings', true, true, true, false, NULL, 'Your appointment at {{business_name}} is confirmed', 'Your appointment on {{date}} at {{time}} is confirmed. Reply STOP to unsubscribe.'),
('booking_pending', 'Booking Pending Approval', 'Sent when a booking requires admin approval', 'bookings', true, false, true, true, NULL, 'Your booking request is pending approval', NULL),
('booking_approved', 'Booking Approved', 'Sent when admin approves a pending booking', 'bookings', true, true, true, false, NULL, 'Your booking has been approved!', 'Great news! Your appointment on {{date}} has been approved.'),
('booking_cancelled', 'Booking Cancelled', 'Sent when a booking is cancelled', 'bookings', true, true, true, true, NULL, 'Your appointment has been cancelled', 'Your appointment on {{date}} at {{time}} has been cancelled.'),
('booking_rescheduled', 'Booking Rescheduled', 'Sent when a booking is rescheduled', 'bookings', true, true, true, true, NULL, 'Your appointment has been rescheduled', 'Your appointment has been rescheduled to {{date}} at {{time}}.'),

-- Reminder Events
('reminder_24h', '24-Hour Reminder', 'Sent 24 hours before the appointment', 'reminders', true, true, true, false, 1440, 'Reminder: Your appointment is tomorrow', 'Reminder: Your appointment is tomorrow at {{time}}.'),
('reminder_2h', '2-Hour Reminder', 'Sent 2 hours before the appointment', 'reminders', false, true, true, false, 120, 'Your appointment is in 2 hours', 'Your appointment at {{business_name}} is in 2 hours.'),
('reminder_1h', '1-Hour Reminder', 'Sent 1 hour before the appointment', 'reminders', false, false, true, false, 60, 'Your appointment is in 1 hour', 'Your appointment is in 1 hour. See you soon!'),

-- Check-in Events
('checkin_confirmation', 'Check-in Confirmation', 'Sent when client checks in', 'checkin', true, false, true, false, NULL, 'You are checked in!', NULL),
('checkin_staff_alert', 'Staff Check-in Alert', 'Alert staff when client checks in', 'checkin', true, false, false, true, NULL, 'Client has checked in', NULL),

-- Staff Notifications
('new_booking_staff', 'New Booking (Staff)', 'Alert staff of new bookings', 'staff', true, false, false, true, NULL, 'New booking received', NULL),
('daily_summary', 'Daily Summary', 'Daily appointment summary for staff', 'staff', true, false, false, true, NULL, 'Your appointments for today', NULL),

-- Waitlist Events
('waitlist_added', 'Added to Waitlist', 'Confirmation when added to waitlist', 'waitlist', true, false, true, false, NULL, 'You have been added to our waitlist', NULL),
('waitlist_available', 'Waitlist Availability', 'Alert when spot becomes available', 'waitlist', true, true, true, false, NULL, 'A spot is now available!', 'Great news! A spot has opened up. Book now before it is gone!');
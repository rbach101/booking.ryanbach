
-- Add dual-approval tracking columns to bookings
ALTER TABLE public.bookings ADD COLUMN approved_by_practitioner_1 uuid;
ALTER TABLE public.bookings ADD COLUMN approved_by_practitioner_2 uuid;

-- Rename twilio_sid to vonage_message_id in sms_messages
ALTER TABLE public.sms_messages RENAME COLUMN twilio_sid TO vonage_message_id;

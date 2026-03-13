-- Drop existing constraint and add updated one with 'checked-in' status
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check 
CHECK (status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'checked-in'::text, 'no-show'::text]));
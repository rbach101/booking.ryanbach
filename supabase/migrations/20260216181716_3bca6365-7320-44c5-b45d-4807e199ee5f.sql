
ALTER TABLE public.bookings ADD COLUMN consent_email boolean NOT NULL DEFAULT false;
ALTER TABLE public.bookings ADD COLUMN consent_sms boolean NOT NULL DEFAULT false;

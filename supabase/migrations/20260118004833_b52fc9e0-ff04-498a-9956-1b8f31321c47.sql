-- Add insurance-related fields to bookings table for insurance verification
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS is_insurance_booking BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS insurance_provider TEXT,
ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT,
ADD COLUMN IF NOT EXISTS insurance_group_number TEXT,
ADD COLUMN IF NOT EXISTS insurance_member_id TEXT,
ADD COLUMN IF NOT EXISTS insurance_subscriber_name TEXT,
ADD COLUMN IF NOT EXISTS insurance_subscriber_dob DATE,
ADD COLUMN IF NOT EXISTS insurance_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS insurance_verification_notes TEXT;

-- Add comment explaining the fields
COMMENT ON COLUMN public.bookings.is_insurance_booking IS 'Whether this booking is an insurance-covered massage';
COMMENT ON COLUMN public.bookings.insurance_provider IS 'Name of the insurance company';
COMMENT ON COLUMN public.bookings.insurance_policy_number IS 'Insurance policy number';
COMMENT ON COLUMN public.bookings.insurance_group_number IS 'Insurance group number';
COMMENT ON COLUMN public.bookings.insurance_member_id IS 'Member/Subscriber ID on insurance card';
COMMENT ON COLUMN public.bookings.insurance_subscriber_name IS 'Name of the insurance policy holder';
COMMENT ON COLUMN public.bookings.insurance_subscriber_dob IS 'Date of birth of the subscriber for verification';
COMMENT ON COLUMN public.bookings.insurance_verified IS 'Whether insurance coverage has been verified';
COMMENT ON COLUMN public.bookings.insurance_verification_notes IS 'Notes from insurance verification process';
-- Add stripe_price_id column to membership_plans table
ALTER TABLE public.membership_plans 
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_product_id TEXT;

-- Add deposit_paid and payment columns to bookings for tracking payments
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS balance_due NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS balance_paid BOOLEAN DEFAULT false;
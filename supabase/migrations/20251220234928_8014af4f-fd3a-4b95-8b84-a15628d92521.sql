-- Add new columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS last_appointment timestamp with time zone,
ADD COLUMN IF NOT EXISTS total_appointments integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS address text;
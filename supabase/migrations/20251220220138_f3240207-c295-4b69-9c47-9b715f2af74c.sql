-- Create business settings table
CREATE TABLE public.business_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text NOT NULL DEFAULT 'Custom Booking',
  phone text,
  email text,
  address text,
  opening_time time without time zone DEFAULT '08:00',
  closing_time time without time zone DEFAULT '20:00',
  buffer_time integer DEFAULT 15,
  advance_booking_days integer DEFAULT 30,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage settings
CREATE POLICY "Admins can manage business settings"
ON public.business_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staff can view settings
CREATE POLICY "Staff can view business settings"
ON public.business_settings
FOR SELECT
TO authenticated
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_business_settings_updated_at
BEFORE UPDATE ON public.business_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.business_settings (business_name, phone, email, address)
VALUES ('Custom Booking', '(808) 555-0100', 'support@example.com', '123 Ocean Drive, Honolulu, HI 96815');

-- Create booking_payments table to track all charges, payment links, and tips
CREATE TABLE public.booking_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'deposit', 'balance', 'tip', 'auto_charge'
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'failed', 'expired'
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_checkout_url TEXT,
  sent_to_email TEXT,
  sent_to_phone TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- Staff can view all payment records
CREATE POLICY "Staff can view payments"
ON public.booking_payments
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Staff can manage payments
CREATE POLICY "Staff can manage payments"
ON public.booking_payments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- Allow inserts from edge functions (service role)
CREATE POLICY "Anyone can insert payments"
ON public.booking_payments
FOR INSERT
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_booking_payments_updated_at
BEFORE UPDATE ON public.booking_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_booking_payments_booking_id ON public.booking_payments(booking_id);

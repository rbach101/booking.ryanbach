-- Create customers table for CRM
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Staff and admins can view all customers
CREATE POLICY "Staff and admins can view customers"
ON public.customers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')
);

-- Staff and admins can create customers
CREATE POLICY "Staff and admins can create customers"
ON public.customers
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')
);

-- Staff and admins can update customers
CREATE POLICY "Staff and admins can update customers"
ON public.customers
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff')
);

-- Only admins can delete customers
CREATE POLICY "Admins can delete customers"
ON public.customers
FOR DELETE
USING (
  has_role(auth.uid(), 'admin')
);

-- Create trigger for updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add customer_id to bookings table for linking
ALTER TABLE public.bookings 
ADD COLUMN customer_id UUID REFERENCES public.customers(id);
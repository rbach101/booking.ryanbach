
-- Table to track coupon redemptions (single-use per email)
CREATE TABLE public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  redeemed_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: one redemption per coupon per email
CREATE UNIQUE INDEX idx_coupon_email_unique ON public.coupon_redemptions (coupon_code, customer_email);

-- Table to track coupon popup signups
CREATE TABLE public.coupon_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  phone text,
  coupon_code text NOT NULL DEFAULT 'NEWMEMBER',
  source text DEFAULT 'popup',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_coupon_signup_email ON public.coupon_signups (email);

-- RLS
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_signups ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public booking flow)
CREATE POLICY "Anyone can insert coupon redemptions" ON public.coupon_redemptions FOR INSERT TO public WITH CHECK (true);

-- Staff can view
CREATE POLICY "Staff can view coupon redemptions" ON public.coupon_redemptions FOR SELECT TO public USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)
);

-- Anyone can sign up for coupon
CREATE POLICY "Anyone can insert coupon signups" ON public.coupon_signups FOR INSERT TO public WITH CHECK (true);

-- Staff can view signups
CREATE POLICY "Staff can view coupon signups" ON public.coupon_signups FOR SELECT TO public USING (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)
);

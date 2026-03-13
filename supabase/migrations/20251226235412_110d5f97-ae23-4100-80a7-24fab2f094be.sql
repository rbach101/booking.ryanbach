-- =============================================
-- FEATURE 1: Automated Appointment Reminders
-- =============================================

-- Track sent reminders to avoid duplicates
CREATE TABLE public.appointment_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- '24h', '1h', 'confirmation'
  sent_via TEXT NOT NULL, -- 'sms', 'email', 'both'
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'delivered'
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view reminders" ON public.appointment_reminders
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "System can insert reminders" ON public.appointment_reminders
  FOR INSERT WITH CHECK (true);

-- =============================================
-- FEATURE 2: Digital Intake Forms
-- =============================================

-- Form templates
CREATE TABLE public.intake_form_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  form_fields JSONB NOT NULL DEFAULT '[]', -- Array of field definitions
  is_active BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT true,
  service_ids UUID[] DEFAULT '{}', -- Services this form applies to
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_form_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active templates" ON public.intake_form_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage templates" ON public.intake_form_templates
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Client form responses
CREATE TABLE public.intake_form_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.intake_form_templates(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  client_email TEXT NOT NULL,
  client_name TEXT NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}',
  signature_data TEXT, -- Base64 encoded signature
  signed_at TIMESTAMP WITH TIME ZONE,
  ip_address TEXT,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_form_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view responses" ON public.intake_form_responses
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Anyone can submit responses" ON public.intake_form_responses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage responses" ON public.intake_form_responses
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- FEATURE 3: SOAP Notes
-- =============================================

CREATE TABLE public.soap_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  practitioner_id UUID REFERENCES public.practitioners(id) ON DELETE SET NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- SOAP fields
  subjective TEXT, -- Client's description of symptoms/concerns
  objective TEXT, -- Observable findings, assessments
  assessment TEXT, -- Practitioner's assessment/diagnosis
  plan TEXT, -- Treatment plan, recommendations
  
  -- Body diagram annotations (JSON with coordinates and notes)
  body_annotations JSONB DEFAULT '[]',
  
  -- Additional fields
  treatment_duration INTEGER, -- Minutes
  techniques_used TEXT[],
  areas_treated TEXT[],
  pressure_level TEXT, -- 'light', 'medium', 'firm', 'deep'
  
  -- Follow-up
  follow_up_recommended BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.soap_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practitioners can manage their notes" ON public.soap_notes
  FOR ALL USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid())
  );

CREATE POLICY "Staff can view notes" ON public.soap_notes
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER update_soap_notes_updated_at
  BEFORE UPDATE ON public.soap_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FEATURE 4: No-Show Protection
-- =============================================

-- Add cancellation policy settings to business_settings
ALTER TABLE public.business_settings 
  ADD COLUMN IF NOT EXISTS cancellation_policy_hours INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS no_show_fee_percentage INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS require_card_for_booking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_policy_text TEXT DEFAULT 'Please cancel at least 24 hours before your appointment to avoid a cancellation fee.';

-- Track no-shows and late cancellations
CREATE TABLE public.booking_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL, -- 'no_show', 'late_cancel', 'late_arrival'
  fee_amount NUMERIC DEFAULT 0,
  fee_charged BOOLEAN DEFAULT false,
  fee_waived BOOLEAN DEFAULT false,
  waived_by UUID,
  waived_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage incidents" ON public.booking_incidents
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

-- =============================================
-- FEATURE 5: Waitlist Management
-- =============================================

CREATE TABLE public.waitlist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
  practitioner_id UUID REFERENCES public.practitioners(id) ON DELETE SET NULL, -- NULL = any practitioner
  
  -- Preferences
  preferred_days INTEGER[] DEFAULT '{}', -- 0=Sunday, 1=Monday, etc.
  preferred_time_start TIME,
  preferred_time_end TIME,
  date_range_start DATE,
  date_range_end DATE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'notified', 'booked', 'expired', 'cancelled'
  notified_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage waitlist" ON public.waitlist
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "Anyone can join waitlist" ON public.waitlist
  FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_waitlist_updated_at
  BEFORE UPDATE ON public.waitlist
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FEATURE 6: Memberships & Packages
-- =============================================

-- Membership plan definitions
CREATE TABLE public.membership_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Pricing
  price NUMERIC NOT NULL,
  billing_period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'quarterly', 'yearly'
  
  -- Benefits
  sessions_included INTEGER NOT NULL DEFAULT 1,
  service_ids UUID[] DEFAULT '{}', -- Services covered by this plan
  discount_percentage INTEGER DEFAULT 0, -- Additional discount on other services
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans" ON public.membership_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage plans" ON public.membership_plans
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Customer memberships
CREATE TABLE public.customer_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.membership_plans(id) ON DELETE RESTRICT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'cancelled', 'expired'
  
  -- Billing
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_billing_date DATE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- Sessions
  sessions_remaining INTEGER NOT NULL DEFAULT 0,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  
  -- Stripe integration (optional)
  stripe_subscription_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage memberships" ON public.customer_memberships
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER update_customer_memberships_updated_at
  BEFORE UPDATE ON public.customer_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Session packages (prepaid bundles)
CREATE TABLE public.session_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Package details
  session_count INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  service_ids UUID[] DEFAULT '{}',
  valid_days INTEGER DEFAULT 365, -- Days until expiration
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.session_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages" ON public.session_packages
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage packages" ON public.session_packages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Customer purchased packages
CREATE TABLE public.customer_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.session_packages(id) ON DELETE RESTRICT,
  
  -- Sessions
  sessions_remaining INTEGER NOT NULL,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  
  -- Status
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'exhausted'
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage customer packages" ON public.customer_packages
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE TRIGGER update_customer_packages_updated_at
  BEFORE UPDATE ON public.customer_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_appointment_reminders_booking ON public.appointment_reminders(booking_id);
CREATE INDEX idx_intake_responses_customer ON public.intake_form_responses(customer_id);
CREATE INDEX idx_intake_responses_booking ON public.intake_form_responses(booking_id);
CREATE INDEX idx_soap_notes_customer ON public.soap_notes(customer_id);
CREATE INDEX idx_soap_notes_practitioner ON public.soap_notes(practitioner_id);
CREATE INDEX idx_waitlist_status ON public.waitlist(status);
CREATE INDEX idx_customer_memberships_customer ON public.customer_memberships(customer_id);
CREATE INDEX idx_customer_packages_customer ON public.customer_packages(customer_id);
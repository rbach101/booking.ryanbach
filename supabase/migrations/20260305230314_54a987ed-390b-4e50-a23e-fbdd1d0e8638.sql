
-- Create a validation trigger that enforces practitioner-service mapping
-- This prevents bookings where the practitioner is not in the service's practitioner_ids array
CREATE OR REPLACE FUNCTION public.validate_practitioner_service_mapping()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  service_practitioner_ids uuid[];
  service_name text;
  practitioner_name text;
BEGIN
  -- Skip if no service or no practitioner assigned
  IF NEW.service_id IS NULL OR NEW.practitioner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip cancelled bookings
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Get the service's allowed practitioner_ids
  SELECT s.practitioner_ids, s.name INTO service_practitioner_ids, service_name
  FROM services s
  WHERE s.id = NEW.service_id;

  -- If service has no practitioner restrictions (empty array or null), allow any practitioner
  IF service_practitioner_ids IS NULL OR array_length(service_practitioner_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if primary practitioner is in the allowed list
  IF NOT (NEW.practitioner_id = ANY(service_practitioner_ids)) THEN
    SELECT p.name INTO practitioner_name FROM practitioners p WHERE p.id = NEW.practitioner_id;
    RAISE EXCEPTION 'Practitioner "%" is not authorized to perform service "%". Please select an authorized practitioner.',
      COALESCE(practitioner_name, 'Unknown'), COALESCE(service_name, 'Unknown')
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- Check 2nd practitioner for couples massage
  IF NEW.practitioner_2_id IS NOT NULL AND NOT (NEW.practitioner_2_id = ANY(service_practitioner_ids)) THEN
    SELECT p.name INTO practitioner_name FROM practitioners p WHERE p.id = NEW.practitioner_2_id;
    RAISE EXCEPTION 'Second practitioner "%" is not authorized to perform service "%". Please select an authorized practitioner.',
      COALESCE(practitioner_name, 'Unknown'), COALESCE(service_name, 'Unknown')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- Attach the trigger to bookings table (before insert and update)
DROP TRIGGER IF EXISTS validate_practitioner_service ON public.bookings;
CREATE TRIGGER validate_practitioner_service
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_practitioner_service_mapping();

-- Also create the business_rules table for storing natural language rules
CREATE TABLE IF NOT EXISTS public.business_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_text text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  severity text NOT NULL DEFAULT 'warning',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;

-- Only admins can manage business rules
CREATE POLICY "Admins can manage business rules"
  ON public.business_rules FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Staff can view rules
CREATE POLICY "Staff can view business rules"
  ON public.business_rules FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create rule_violations table to log AI-detected issues
CREATE TABLE IF NOT EXISTS public.rule_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.business_rules(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  violation_description text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rule_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view violations"
  ON public.rule_violations FOR SELECT
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

CREATE POLICY "Admins can manage violations"
  ON public.rule_violations FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Allow system/edge functions to insert violations
CREATE POLICY "System can insert violations"
  ON public.rule_violations FOR INSERT
  WITH CHECK (true);

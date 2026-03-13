-- Enforce: every booking must have a practitioner assigned.
-- No unassigned bookings allowed — prevents slots slipping through when
-- the only practitioner for a service (e.g. Massage With Insurance) is blocked.
-- Existing unassigned bookings are left in place so staff can reassign them first.
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
  -- REQUIRE practitioner for every booking — no exceptions
  IF NEW.practitioner_id IS NULL THEN
    RAISE EXCEPTION 'Every booking must have a practitioner assigned. Unassigned bookings are not allowed.'
      USING ERRCODE = '23514'; -- check_violation
  END IF;

  -- Skip practitioner-service mapping if no service
  IF NEW.service_id IS NULL THEN
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

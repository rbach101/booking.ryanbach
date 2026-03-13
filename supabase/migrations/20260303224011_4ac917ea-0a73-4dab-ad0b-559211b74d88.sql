
-- BUG-15: Add trigger-based double-booking prevention at DB level
-- Using a trigger instead of exclusion constraint because status is text, not enum

CREATE OR REPLACE FUNCTION public.prevent_overlapping_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Skip cancelled bookings
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Check practitioner overlap
  IF NEW.practitioner_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE id != NEW.id
        AND practitioner_id = NEW.practitioner_id
        AND booking_date = NEW.booking_date
        AND status NOT IN ('cancelled')
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
    ) THEN
      RAISE EXCEPTION 'Practitioner already booked during this time slot'
        USING ERRCODE = '23505'; -- unique_violation code for client compatibility
    END IF;
  END IF;

  -- Check 2nd practitioner overlap (couples massage)
  IF NEW.practitioner_2_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE id != NEW.id
        AND booking_date = NEW.booking_date
        AND status NOT IN ('cancelled')
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
        AND (practitioner_id = NEW.practitioner_2_id OR practitioner_2_id = NEW.practitioner_2_id)
    ) THEN
      RAISE EXCEPTION 'Second practitioner already booked during this time slot'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Check room overlap
  IF NEW.room_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM bookings
      WHERE id != NEW.id
        AND room_id = NEW.room_id
        AND booking_date = NEW.booking_date
        AND status NOT IN ('cancelled')
        AND start_time < NEW.end_time
        AND end_time > NEW.start_time
    ) THEN
      RAISE EXCEPTION 'Room already booked during this time slot'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_booking_overlaps
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_overlapping_bookings();

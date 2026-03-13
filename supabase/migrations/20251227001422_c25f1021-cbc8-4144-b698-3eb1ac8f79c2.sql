-- Create a function to notify staff when a client checks in
CREATE OR REPLACE FUNCTION public.notify_staff_on_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  practitioner_user_id uuid;
  practitioner_name text;
  service_name text;
  admin_users uuid[];
BEGIN
  -- Only trigger when status changes to 'checked-in'
  IF NEW.status = 'checked-in' AND (OLD.status IS NULL OR OLD.status != 'checked-in') THEN
    
    -- Get the practitioner's user_id if assigned
    IF NEW.practitioner_id IS NOT NULL THEN
      SELECT user_id, name INTO practitioner_user_id, practitioner_name
      FROM practitioners
      WHERE id = NEW.practitioner_id;
    END IF;
    
    -- Get service name
    IF NEW.service_id IS NOT NULL THEN
      SELECT name INTO service_name
      FROM services
      WHERE id = NEW.service_id;
    END IF;
    
    -- Notify the assigned practitioner if they have a user account
    IF practitioner_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, booking_id, action_url)
      VALUES (
        practitioner_user_id,
        'check-in',
        'Client Checked In',
        NEW.client_name || ' has checked in for their ' || COALESCE(service_name, 'appointment') || ' at ' || to_char(NEW.start_time, 'HH12:MI AM'),
        NEW.id,
        '/calendar'
      );
    END IF;
    
    -- Also notify all admin users
    SELECT ARRAY_AGG(user_id) INTO admin_users
    FROM user_roles
    WHERE role = 'admin';
    
    IF admin_users IS NOT NULL THEN
      FOR i IN 1..array_length(admin_users, 1) LOOP
        -- Don't double-notify if admin is also the practitioner
        IF admin_users[i] != practitioner_user_id OR practitioner_user_id IS NULL THEN
          INSERT INTO notifications (user_id, type, title, message, booking_id, action_url)
          VALUES (
            admin_users[i],
            'check-in',
            'Client Checked In',
            NEW.client_name || ' has checked in for their ' || COALESCE(service_name, 'appointment') || ' with ' || COALESCE(practitioner_name, 'staff'),
            NEW.id,
            '/calendar'
          );
        END IF;
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS on_booking_checkin ON public.bookings;
CREATE TRIGGER on_booking_checkin
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_staff_on_checkin();
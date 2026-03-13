-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Staff can view all bookings" ON public.bookings;

-- Create a new policy that restricts staff to their own bookings
CREATE POLICY "Staff can view their own bookings"
ON public.bookings
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (practitioner_id IN (
    SELECT id FROM practitioners WHERE user_id = auth.uid()
  ))
);

-- Fix 1: Restrict practitioners public SELECT to hide email/phone
-- Drop the overly-permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view active practitioners" ON public.practitioners;

-- Recreate it to only allow access via the practitioners_public view columns
-- The practitioners_public view already excludes email/phone, but the base table policy
-- allows direct access. Replace with a policy that only exposes non-sensitive columns.
-- Since we can't do column-level RLS, we rely on the view for public access.
-- Remove anon/public direct access to the base table entirely.
CREATE POLICY "Anyone can view active practitioners via public view"
  ON public.practitioners FOR SELECT
  USING (
    is_active = true
    AND (
      has_role(auth.uid(), 'admin')
      OR has_role(auth.uid(), 'staff')
      OR (user_id = auth.uid())
    )
  );

-- Fix 2: Drop overly-broad bookings SELECT policy
-- The current policies "Staff can view their own bookings" and "Staff can view bookings as 2nd practitioner"
-- already have proper role-scoped access. We just need to check if there's a blanket USING(true) policy.
DO $$
BEGIN
  -- Drop the overly permissive policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'bookings' 
    AND policyname = 'Staff can view all bookings'
  ) THEN
    DROP POLICY "Staff can view all bookings" ON public.bookings;
  END IF;
END $$;

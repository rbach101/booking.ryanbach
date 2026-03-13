-- Drop existing restrictive policies on availability_blocks
DROP POLICY IF EXISTS "Admins can manage all availability" ON public.availability_blocks;
DROP POLICY IF EXISTS "Authenticated users can view availability" ON public.availability_blocks;
DROP POLICY IF EXISTS "Staff can manage their own availability" ON public.availability_blocks;

-- Create new PERMISSIVE policies (default behavior)
-- Admins can do everything
CREATE POLICY "Admins can manage all availability"
ON public.availability_blocks
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staff can manage availability for practitioners linked to their account
CREATE POLICY "Staff can manage their own availability"
ON public.availability_blocks
FOR ALL
TO authenticated
USING (
  practitioner_id IN (
    SELECT id FROM public.practitioners WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  practitioner_id IN (
    SELECT id FROM public.practitioners WHERE user_id = auth.uid()
  )
);

-- Anyone authenticated can view availability (for booking purposes)
CREATE POLICY "Authenticated users can view availability"
ON public.availability_blocks
FOR SELECT
TO authenticated
USING (true);

-- Public users can also view availability (for public booking page)
CREATE POLICY "Public can view availability"
ON public.availability_blocks
FOR SELECT
TO anon
USING (true);
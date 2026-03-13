CREATE POLICY "Public can view active practitioners"
ON public.practitioners
FOR SELECT
TO anon
USING (is_active = true);
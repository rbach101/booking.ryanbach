
-- Fix: ALL policy needs WITH CHECK for INSERT to work
DROP POLICY "Admins can manage practitioners" ON public.practitioners;

CREATE POLICY "Admins can manage practitioners"
ON public.practitioners
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

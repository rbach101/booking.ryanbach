-- Fix: ALL policy on calendar_connections needs WITH CHECK for INSERT/UPDATE to work
DROP POLICY "Users can manage their own calendar connections" ON public.calendar_connections;

CREATE POLICY "Users can manage their own calendar connections"
ON public.calendar_connections
FOR ALL
TO authenticated
USING ((connected_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK ((connected_by = auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
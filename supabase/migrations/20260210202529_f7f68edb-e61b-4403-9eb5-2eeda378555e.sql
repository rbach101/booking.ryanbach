
-- Drop the overly permissive policy and replace with tighter ones
DROP POLICY "Service role can manage busy cache" ON public.calendar_busy_cache;

-- Service role writes are not restricted by RLS (service role bypasses RLS),
-- so we don't need an ALL policy. The SELECT policy for staff is sufficient.

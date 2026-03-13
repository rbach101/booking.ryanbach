
-- Cache table for Google Calendar busy times
CREATE TABLE public.calendar_busy_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID NOT NULL REFERENCES public.calendar_connections(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT,
  week_start DATE NOT NULL,
  busy_times JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(connection_id, week_start)
);

-- Index for fast lookups by week
CREATE INDEX idx_calendar_busy_cache_week ON public.calendar_busy_cache(week_start);
CREATE INDEX idx_calendar_busy_cache_owner ON public.calendar_busy_cache(owner_type, owner_id);

-- Enable RLS
ALTER TABLE public.calendar_busy_cache ENABLE ROW LEVEL SECURITY;

-- Staff and admin can read cached busy times
CREATE POLICY "Staff can read busy cache"
  ON public.calendar_busy_cache
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff')
  );

-- Only service role (edge functions) can write
CREATE POLICY "Service role can manage busy cache"
  ON public.calendar_busy_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable realtime for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_busy_cache;

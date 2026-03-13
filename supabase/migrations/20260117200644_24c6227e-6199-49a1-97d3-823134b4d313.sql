-- Add column to store Google Calendar display name
ALTER TABLE public.calendar_connections 
ADD COLUMN google_calendar_name TEXT;
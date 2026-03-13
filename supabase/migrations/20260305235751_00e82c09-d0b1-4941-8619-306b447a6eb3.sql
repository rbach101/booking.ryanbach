
-- The practitioners_public view uses security_invoker=on, which means it runs
-- as the calling role (anon). Since we revoked anon SELECT on practitioners,
-- the view can't read the base table. Fix by recreating without security_invoker.
DROP VIEW IF EXISTS public.practitioners_public;

CREATE VIEW public.practitioners_public AS
  SELECT 
    id, user_id, is_active, created_at, updated_at,
    name, bio, image_url, specialties, color
  FROM public.practitioners
  WHERE is_active = true;

-- Grant anon and authenticated access to the view
GRANT SELECT ON public.practitioners_public TO anon;
GRANT SELECT ON public.practitioners_public TO authenticated;

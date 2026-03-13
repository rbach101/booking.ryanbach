DROP VIEW IF EXISTS public.practitioners_public;
CREATE VIEW public.practitioners_public
WITH (security_invoker = false)
AS
SELECT id, user_id, is_active, created_at, updated_at, name, bio, image_url, specialties, color
FROM practitioners
WHERE is_active = true;

GRANT SELECT ON public.practitioners_public TO anon;
GRANT SELECT ON public.practitioners_public TO authenticated;
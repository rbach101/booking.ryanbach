DROP VIEW IF EXISTS public.practitioners_public;
CREATE VIEW public.practitioners_public
WITH (security_invoker = true)
AS
SELECT id, user_id, is_active, created_at, updated_at, name, bio, image_url, specialties, color
FROM practitioners
WHERE is_active = true;
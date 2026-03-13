-- Create a public view for practitioners that excludes sensitive contact info
-- This allows clients to see practitioner names, bios, specialties without exposing personal contact details
CREATE VIEW public.practitioners_public
WITH (security_invoker=on) AS
  SELECT 
    id,
    user_id,
    name,
    bio,
    image_url,
    specialties,
    color,
    is_active,
    created_at,
    updated_at
  FROM public.practitioners;

-- Grant select on the view to all roles that need it
GRANT SELECT ON public.practitioners_public TO anon;
GRANT SELECT ON public.practitioners_public TO authenticated;

-- Drop the overly permissive policy that allows any authenticated user to see all practitioner data
DROP POLICY IF EXISTS "Authenticated users can view practitioners" ON public.practitioners;

-- Create a new policy that only allows staff/admin to view full practitioner records (including email/phone)
CREATE POLICY "Staff and admins can view all practitioner details"
ON public.practitioners
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
  OR user_id = auth.uid()
);

-- Add a comment documenting the security design
COMMENT ON VIEW public.practitioners_public IS 'Public view of practitioners excluding personal contact info (email, phone). Use this view for client-facing features like booking.';
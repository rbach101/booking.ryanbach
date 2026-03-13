-- Drop the existing SELECT policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a new SELECT policy that explicitly requires authentication
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Ensure there's no public access by adding explicit denial for anon role
-- The TO authenticated clause already restricts to authenticated users only
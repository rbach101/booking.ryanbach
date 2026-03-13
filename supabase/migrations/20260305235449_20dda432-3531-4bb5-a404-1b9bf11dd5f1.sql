
-- Fix 1: Remove the overly broad anon SELECT policy on practitioners
-- and replace with one that only exposes non-sensitive fields via the view
DROP POLICY IF EXISTS "Public can view active practitioners" ON public.practitioners;

-- Re-create the policy but restrict to only allow access when queried through 
-- the practitioners_public view by limiting visible columns isn't possible in RLS.
-- Instead, we keep the anon policy but the practitioners_public view (security_invoker=on)
-- already strips email/phone. The real fix is ensuring anon users ONLY query the view.
-- However, since RLS can't restrict column access, we need a different approach:
-- Grant anon SELECT only on specific columns won't work with RLS.
-- 
-- Best approach: Revoke direct table SELECT from anon role and only grant on the view.
REVOKE SELECT ON public.practitioners FROM anon;
GRANT SELECT ON public.practitioners_public TO anon;

-- Fix 2: Explicitly deny anon access to customers table (already staff-only, but be explicit)
REVOKE ALL ON public.customers FROM anon;

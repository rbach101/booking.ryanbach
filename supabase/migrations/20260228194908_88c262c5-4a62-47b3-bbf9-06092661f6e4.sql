-- Allow public/anonymous users to view active practitioners (needed for booking wizard)
CREATE POLICY "Anyone can view active practitioners" ON public.practitioners
  FOR SELECT
  USING (is_active = true);
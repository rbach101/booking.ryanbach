
-- Create booking_extras table
CREATE TABLE public.booking_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  description text,
  image_url text,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.booking_extras ENABLE ROW LEVEL SECURITY;

-- Admins can manage extras
CREATE POLICY "Admins can manage extras" ON public.booking_extras
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Anyone can view active extras (for booking wizard)
CREATE POLICY "Anyone can view active extras" ON public.booking_extras
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Staff can view all extras
CREATE POLICY "Staff can view all extras" ON public.booking_extras
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'));

-- Create storage bucket for extra images
INSERT INTO storage.buckets (id, name, public) VALUES ('extras', 'extras', true);

-- Allow authenticated users to upload to extras bucket
CREATE POLICY "Admins can upload extras images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'extras' AND has_role(auth.uid(), 'admin'));

-- Anyone can view extras images (public bucket)
CREATE POLICY "Public can view extras images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'extras');

-- Admins can delete extras images
CREATE POLICY "Admins can delete extras images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'extras' AND has_role(auth.uid(), 'admin'));

-- Seed with existing extras data
INSERT INTO public.booking_extras (name, price, description, sort_order) VALUES
  ('Essential Oils', 20, 'Premium aromatherapy enhancement', 1),
  ('Hot Stone (Pohaku) 15 min', 30, 'Heated basalt stones for deeper relaxation', 2),
  ('Hot Stone Facial 15 min', 50, 'Rejuvenating facial with hot stones', 3),
  ('Amethyst Biomat', 15, 'Infrared heat therapy mat', 4),
  ('Red Light Therapy 15 min', 45, 'Therapeutic red light treatment', 5),
  ('Cupping Therapy', 30, 'Traditional cupping for muscle relief', 6),
  ('Arnica Deep Tissue Oil', 5, 'Soothing arnica oil treatment', 7),
  ('Deep Blue Lotion', 5, 'Cooling muscle relief lotion', 8),
  ('Aloe Gel', 5, 'Soothing aloe vera application', 9);


-- Add second practitioner column for couples massage bookings
ALTER TABLE public.bookings 
ADD COLUMN practitioner_2_id uuid REFERENCES public.practitioners(id) ON DELETE SET NULL;

-- Add index for querying by second practitioner
CREATE INDEX idx_bookings_practitioner_2_id ON public.bookings(practitioner_2_id);

-- Update RLS: Staff can also manage bookings where they are the 2nd practitioner
CREATE POLICY "Staff can manage bookings as 2nd practitioner"
ON public.bookings
FOR ALL
USING (
  practitioner_2_id IN (
    SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid()
  )
);

CREATE POLICY "Staff can view bookings as 2nd practitioner"
ON public.bookings
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  practitioner_2_id IN (
    SELECT practitioners.id FROM practitioners WHERE practitioners.user_id = auth.uid()
  )
);

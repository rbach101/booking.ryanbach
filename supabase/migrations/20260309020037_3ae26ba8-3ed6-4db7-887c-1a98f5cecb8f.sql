CREATE POLICY "Staff can delete pending payments"
ON public.booking_payments
FOR DELETE
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role))
);
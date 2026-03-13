
-- Email templates for admins to reuse
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text,
  category text NOT NULL DEFAULT 'general',
  created_by uuid,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email templates"
  ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sent emails log
CREATE TABLE public.sent_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.email_templates(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body_html text NOT NULL,
  sent_by uuid,
  status text NOT NULL DEFAULT 'sent',
  resend_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sent emails"
  ON public.sent_emails FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view sent emails"
  ON public.sent_emails FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role));

-- Seed default templates
INSERT INTO public.email_templates (name, subject, body_html, body_text, category) VALUES
(
  'Appointment Reminder',
  'Reminder: Your Appointment at Custom Booking',
  '<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #6b8f71; font-size: 24px; margin: 0;">Custom Booking</h1></div><p style="color: #555; font-size: 16px; line-height: 1.7;">Hi {{client_name}},</p><p style="color: #555; font-size: 16px; line-height: 1.7;">This is a friendly reminder about your upcoming appointment. We look forward to seeing you!</p><p style="color: #555; font-size: 16px; line-height: 1.7;">Warm regards,<br/>Custom Booking</p><hr style="border: none; border-top: 1px solid #e0ddd8; margin: 30px 0 15px;"/><p style="color: #aaa; font-size: 12px; text-align: center;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p></div>',
  'Hi {{client_name}}, This is a friendly reminder about your upcoming appointment. We look forward to seeing you! Warm regards, Custom Booking',
  'reminders'
),
(
  'Thank You / Follow-Up',
  'Thank You for Visiting Custom Booking!',
  '<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #6b8f71; font-size: 24px; margin: 0;">Custom Booking</h1></div><p style="color: #555; font-size: 16px; line-height: 1.7;">Hi {{client_name}},</p><p style="color: #555; font-size: 16px; line-height: 1.7;">Thank you for visiting us! We hope you enjoyed your session and are feeling wonderful. We''d love to see you again soon.</p><p style="color: #555; font-size: 16px; line-height: 1.7;">If you have any feedback or would like to book your next appointment, don''t hesitate to reach out.</p><p style="color: #555; font-size: 16px; line-height: 1.7;">Thanks,<br/>Custom Booking</p><hr style="border: none; border-top: 1px solid #e0ddd8; margin: 30px 0 15px;"/><p style="color: #aaa; font-size: 12px; text-align: center;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p></div>',
  'Hi {{client_name}}, Thank you for visiting us! We hope you enjoyed your session. Thanks, Custom Booking',
  'follow-up'
),
(
  'Special Promotion',
  'A Special Offer Just for You – Custom Booking',
  '<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #6b8f71; font-size: 24px; margin: 0;">Custom Booking</h1></div><p style="color: #555; font-size: 16px; line-height: 1.7;">Hi {{client_name}},</p><p style="color: #555; font-size: 16px; line-height: 1.7;">We have a special offer just for you! Book your next appointment and enjoy an exclusive discount as a valued client.</p><p style="color: #555; font-size: 16px; line-height: 1.7;">This offer is available for a limited time, so don''t miss out!</p><div style="text-align: center; margin: 30px 0;"><a href="https://booking.example.com/book" style="display:inline-block;padding:16px 36px;background-color:#6b8f71;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:17px;">Book Now</a></div><p style="color: #555; font-size: 16px; line-height: 1.7;">Thanks,<br/>Custom Booking</p><hr style="border: none; border-top: 1px solid #e0ddd8; margin: 30px 0 15px;"/><p style="color: #aaa; font-size: 12px; text-align: center;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p></div>',
  'Hi {{client_name}}, We have a special offer just for you! Book your next appointment at https://booking.example.com/book. Thanks, Custom Booking',
  'promotions'
),
(
  'Custom Message',
  'A Message from Custom Booking',
  '<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #6b8f71; font-size: 24px; margin: 0;">Custom Booking</h1></div><p style="color: #555; font-size: 16px; line-height: 1.7;">Hi {{client_name}},</p><p style="color: #555; font-size: 16px; line-height: 1.7;">{{message}}</p><p style="color: #555; font-size: 16px; line-height: 1.7;">Warm regards,<br/>Custom Booking</p><hr style="border: none; border-top: 1px solid #e0ddd8; margin: 30px 0 15px;"/><p style="color: #aaa; font-size: 12px; text-align: center;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p></div>',
  'Hi {{client_name}}, {{message}} Warm regards, Custom Booking',
  'general'
);

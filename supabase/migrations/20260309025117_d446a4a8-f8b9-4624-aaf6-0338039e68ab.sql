
ALTER TABLE public.practitioners
  ADD COLUMN sms_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN sms_consent_token text UNIQUE,
  ADD COLUMN sms_consent_at timestamptz,
  ADD COLUMN sms_consent_ip text;

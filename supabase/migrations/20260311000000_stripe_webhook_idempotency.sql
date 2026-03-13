-- Idempotency table for Stripe webhook events.
-- Prevents duplicate processing when Stripe retries or sends the same event twice.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_webhook_events IS 'Tracks processed Stripe webhook events for idempotency';

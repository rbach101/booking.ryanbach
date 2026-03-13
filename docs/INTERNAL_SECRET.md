# INTERNAL_SECRET for Cron-Invoked Edge Functions

**If you use Supabase Cron or another service to call `post-appointment-payment` or `reconcile-payments`**, those requests must include the header:

```
x-internal-secret: <your-secret-value>
```

The following edge functions require the `x-internal-secret` header when invoked by cron or other internal services:

- **reconcile-payments** – Reconciles pending Stripe payments with booking_payments
- **post-appointment-payment** – Sends follow-up emails and auto-charges balances after appointments end

## Setup

1. Generate a secure random string (e.g. `openssl rand -hex 32`)
2. Add to Supabase project secrets:
   ```bash
   supabase secrets set INTERNAL_SECRET=your-generated-secret
   ```
3. When invoking these functions from cron (pg_cron, external cron, etc.), include the header:
   ```
   x-internal-secret: your-generated-secret
   ```

## Example: pg_cron with pg_net

```sql
SELECT net.http_post(
  url := 'https://<project-ref>.supabase.co/functions/v1/post-appointment-payment',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
    'x-internal-secret', current_setting('app.settings.internal_secret')
  ),
  body := '{}'
);
```

(Adjust for your actual cron setup; the service role key may be passed differently.)

## Backward Compatibility

If `INTERNAL_SECRET` is not set, these functions allow unauthenticated requests (for backward compatibility during setup). **Set the secret in production** to lock down cron-invoked functions.

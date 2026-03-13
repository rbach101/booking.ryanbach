# Deployment Checklist

Use this checklist when deploying the latest security and reliability changes.

## 1. Environment Secrets

### INTERNAL_SECRET (for cron-invoked functions)

Required for: `reconcile-payments`, `post-appointment-payment`

```bash
# Generate a secure secret
openssl rand -hex 32

# Set in Supabase (replace with your project ref)
supabase secrets set INTERNAL_SECRET=<paste-generated-secret>
```

## 2. Cron Jobs

**If you use Supabase Cron or another service to call `post-appointment-payment` or `reconcile-payments`**, those requests must include the header:

```
x-internal-secret: <your-secret-value>
```

If you use **pg_cron**, **Supabase Cron**, or an **external cron** to invoke:

- `post-appointment-payment` (follow-up emails, auto-charge)
- `reconcile-payments` (Stripe payment reconciliation)

Add the header to each request:

```
x-internal-secret: <your-INTERNAL_SECRET-value>
```

Example (Supabase pg_net):

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

## 3. Verify After Deploy

1. **charge-balance** – Staff completing payment from BookingsPage or CompletePaymentPage should work (JWT sent automatically).
2. **create-deposit-payment** – Public booking flow should work (deposit token from submit-booking).
3. **Health monitor** – Health checks still work (bypass auth with `healthCheck: true`).
4. **Cron functions** – If INTERNAL_SECRET is set, cron must pass it. If not set, functions allow unauthenticated (backward compat).

## 4. Rollback Notes

- If charge-balance returns 401: Ensure frontend passes `Authorization: Bearer <session.access_token>` (already done in BookingsPage, CompletePaymentPage).
- If create-deposit-payment returns 401: Ensure submit-booking returns `depositToken` and BookingWizard passes it.
- If cron functions fail: Add `x-internal-secret` header, or temporarily unset INTERNAL_SECRET to allow unauthenticated.

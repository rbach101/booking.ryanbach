# Structured Logging

Edge functions emit structured JSON logs for key events. Use these in Supabase Logs, Logflare, or similar to monitor auth failures, payment flows, and cron runs.

## Log Format

Each structured log is a single JSON line:

```json
{"ts":"2025-03-10T12:00:00.000Z","level":"warn","event":"auth_failed","source":"charge-balance","details":{"reason":"missing_or_invalid_authorization","hasHeader":false}}
```

- **ts** – ISO timestamp
- **level** – `info`, `warn`, or `error`
- **event** – Event type (see below)
- **source** – Function name
- **details** – Optional object with context (no PII)

## Events

### Auth

| Event        | Level | Source                    | When                          |
|-------------|-------|---------------------------|-------------------------------|
| auth_failed | warn  | charge-balance, reconcile-payments, post-appointment-payment | JWT invalid, missing secret, or forbidden role |

### Deposit Token

| Event                 | Level | Source               | When                          |
|-----------------------|-------|----------------------|-------------------------------|
| deposit_token_rejected| warn  | create-deposit-payment | Token missing, invalid, expired, or mismatch |

### Payments

| Event                   | Level | Source               | When                          |
|-------------------------|-------|----------------------|-------------------------------|
| deposit_session_created | info  | create-deposit-payment | Stripe checkout session created |
| deposit_session_failed  | error | create-deposit-payment | Deposit flow error            |
| balance_charge_success  | info  | charge-balance       | Off-session charge succeeded  |
| balance_checkout_fallback| info | charge-balance       | Redirected to Stripe Checkout |
| balance_charge_failed   | error | charge-balance       | Charge or checkout failed     |

### Bookings

| Event          | Level | Source       | When                |
|----------------|-------|--------------|---------------------|
| booking_created| info  | submit-booking | Public booking created |

### Cron

| Event                 | Level | Source               | When                |
|-----------------------|-------|----------------------|---------------------|
| reconcile_started     | info  | reconcile-payments   | Cron run started    |
| reconcile_complete    | info  | reconcile-payments   | Cron run finished   |
| reconcile_failed      | error | reconcile-payments   | Cron run error      |
| post_appointment_started | info | post-appointment-payment | Cron run started  |
| post_appointment_complete | info | post-appointment-payment | Cron run finished |
| post_appointment_failed | error | post-appointment-payment | Cron run error   |

## Querying

In Supabase Dashboard → Logs, filter by `event` or `source`. Example: search for `auth_failed` to find unauthorized attempts.

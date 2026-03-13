# How to Set INTERNAL_SECRET

The `reconcile-payments` and `post-appointment-payment` edge functions require the `x-internal-secret` header when `INTERNAL_SECRET` is set. Follow these steps to configure it.

---

## Cron Jobs

**If you use Supabase Cron or another service to call `post-appointment-payment` or `reconcile-payments`**, those requests must include the header:

```
x-internal-secret: <your-secret-value>
```

Use the same value you set as `INTERNAL_SECRET` in Supabase.

---

## Step 1: Generate a Secret

Run this in your terminal to generate a secure random string:

```bash
openssl rand -hex 32
```

Example output: `a1b2c3d4e5f6...` (64 characters)

**Copy this value** — you'll use it in the next steps.

---

## Step 2: Set the Secret in Supabase

### Option A: Supabase CLI (recommended)

1. Log in (if needed):
   ```bash
   supabase login
   ```

2. Link your project (if not already linked):
   ```bash
   supabase link --project-ref xyqnhfqchsmsjrcyqcji
   ```

3. Set the secret (replace with your generated value):
   ```bash
   supabase secrets set INTERNAL_SECRET=YOUR_GENERATED_SECRET_HERE
   ```

4. Verify:
   ```bash
   supabase secrets list
   ```
   You should see `INTERNAL_SECRET` in the list (value is hidden).

### Option B: Supabase Dashboard

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (**xyqnhfqchsmsjrcyqcji**)
3. Go to **Project Settings** → **Edge Functions** (or **Secrets**)
4. Add a secret:
   - **Name:** `INTERNAL_SECRET`
   - **Value:** paste your generated secret

---

## Step 3: Update Your Cron Jobs

If you use **pg_cron**, **Supabase Cron**, or an **external cron** to call these functions, add the header:

```
x-internal-secret: YOUR_GENERATED_SECRET_HERE
```

### Example: Supabase pg_cron with pg_net

Store the secret in a config table or use `current_setting` if you've set it:

```sql
SELECT net.http_post(
  url := 'https://xyqnhfqchsmsjrcyqcji.supabase.co/functions/v1/post-appointment-payment',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
    'x-internal-secret', current_setting('app.settings.internal_secret')
  ),
  body := '{}'
);
```

### Example: External cron (curl)

```bash
curl -X POST "https://xyqnhfqchsmsjrcyqcji.supabase.co/functions/v1/post-appointment-payment" \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: YOUR_GENERATED_SECRET_HERE" \
  -d '{}'
```

---

## Step 4: Deploy Edge Functions

If you haven't deployed yet:

```bash
# Log in first
supabase login

# Deploy all functions
supabase functions deploy
```

Or deploy via your usual CI/CD or Lovable deployment flow.

---

## Backward Compatibility

- **If INTERNAL_SECRET is NOT set:** The functions allow unauthenticated requests (for backward compatibility).
- **If INTERNAL_SECRET IS set:** Requests must include the matching `x-internal-secret` header, or they will receive 401 Unauthorized.

**Recommendation:** Set the secret in production to lock down cron-invoked functions.

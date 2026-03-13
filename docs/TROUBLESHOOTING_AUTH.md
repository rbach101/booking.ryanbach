# Auth Troubleshooting (401 / 403)

## 401 Unauthorized on `/auth/v1/user`

### Cause

401s on the Supabase Auth endpoint (`/auth/v1/user`) occur when something calls `auth.getUser()` or `auth.getClaims()` with an invalid or non-user token. Common sources:

1. **Health monitor** – The health monitor calls all edge functions with `Authorization: Bearer <anon_key>` and `body: { healthCheck: true }`. The anon key is not a user JWT. Functions that call `auth.getUser()` before handling the health check will hit Auth with the anon key and receive 401.

2. **Expired or invalid user tokens** – Frontend or API clients sending expired or malformed JWTs.

3. **Missing Authorization header** – Requests without a Bearer token.

### Fix for health-monitor 401s

Functions that require auth must handle the health check **before** any auth logic:

```ts
// Health check fast path (matches health-monitor payload: { healthCheck: true })
try {
  const b = await req.clone().json();
  if (b?.healthCheck) {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
} catch { /* not JSON, continue */ }

// ... then auth check
```

Functions that already had this pattern but used a different payload (e.g. `body.type === 'health_check'`) were updated to use `body.healthCheck` to match the health monitor.

---

## 403 Forbidden on `/auth/v1/user`

### Possible causes

1. **User disabled** – The user may have been disabled in Supabase Auth (Dashboard → Authentication → Users → select user → disable).

2. **Auth policy / rate limiting** – Supabase or a proxy may block the request based on IP, region, or abuse rules.

3. **MFA or session requirements** – Some flows require MFA or a specific session state.

### How to investigate

1. **Supabase Dashboard** – Authentication → Users → search by email or ID. Check if the user is disabled or has unusual metadata.

2. **Logs** – In Supabase Dashboard → Logs → Auth, look for the 403 request and any associated error message.

3. **IP** – If the 403 comes from a specific IP (e.g. `54.247.211.100`), check whether it’s a known service (e.g. AWS) or a blocked region.

4. **Recent changes** – If a user was recently disabled or roles changed, that can explain new 403s.

### Edge function 403s

403 from edge functions (not Auth) usually means:

- **Role check failed** – User is authenticated but lacks required role (e.g. `admin` or `staff`). See `_shared/auth.ts` and `logAuthFailure(..., "forbidden_no_staff_role", ...)`.

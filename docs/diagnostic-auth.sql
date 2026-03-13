SELECT id, email, banned_until, last_sign_in_at, created_at,
       CASE WHEN banned_until > now() THEN 'CURRENTLY BANNED' ELSE 'ban expired' END AS status
FROM auth.users
WHERE banned_until IS NOT NULL
ORDER BY banned_until DESC;

SELECT id, email, deleted_at, last_sign_in_at
FROM auth.users
WHERE deleted_at IS NOT NULL;

SELECT u.id, u.email, u.last_sign_in_at, u.banned_until, u.deleted_at,
       array_agg(r.role) AS roles
FROM auth.users u
JOIN public.user_roles r ON r.user_id = u.id
WHERE r.role IN ('admin', 'staff')
GROUP BY u.id, u.email, u.last_sign_in_at, u.banned_until, u.deleted_at
ORDER BY u.last_sign_in_at DESC NULLS LAST;

SELECT u.id, u.email, u.last_sign_in_at
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id AND r.role IN ('admin', 'staff')
WHERE r.user_id IS NULL
  AND u.deleted_at IS NULL
ORDER BY u.last_sign_in_at DESC NULLS LAST;

SELECT r.user_id, r.role, r.created_at
FROM public.user_roles r
LEFT JOIN auth.users u ON u.id = r.user_id
WHERE u.id IS NULL;

SELECT id, email, last_sign_in_at, created_at, banned_until
FROM auth.users
WHERE last_sign_in_at > now() - interval '7 days'
   OR created_at > now() - interval '7 days'
ORDER BY created_at DESC;

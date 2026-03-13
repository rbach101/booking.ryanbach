// Shared auth helpers for edge functions.
// Import with: import { requireStaffOrInternalSecret, requireInternalSecret } from "../_shared/auth.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAuthFailure } from "./logger.ts";

export type AuthResult =
  | { ok: true; userId?: string }
  | { ok: false; response: Response };

export type AuthOptions = { source?: string };

/**
 * Require either (a) valid JWT with staff/admin role, or (b) x-internal-secret header.
 * Use for functions called by staff (frontend) or by cron/internal services.
 */
export async function requireStaffOrInternalSecret(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  corsHeaders: Record<string, string>,
  options?: AuthOptions
): Promise<AuthResult> {
  const source = options?.source ?? "auth";

  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  const secretHeader = req.headers.get("x-internal-secret");

  if (internalSecret && secretHeader === internalSecret) {
    return { ok: true };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    logAuthFailure(source, "missing_or_invalid_authorization", { hasHeader: !!authHeader });
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Unauthorized: missing or invalid authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    logAuthFailure(source, "invalid_token", { error: claimsError?.message });
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Unauthorized: invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  const userId = claimsData.claims.sub as string;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const hasRole = roles?.some((r) => r.role === "admin" || r.role === "staff");
  if (!hasRole) {
    logAuthFailure(source, "forbidden_no_staff_role", { userId });
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: staff or admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  return { ok: true, userId };
}

/**
 * Require x-internal-secret header. Use for cron-invoked functions only.
 * If INTERNAL_SECRET is not set, allows the request (for backward compatibility during setup).
 */
export function requireInternalSecret(
  req: Request,
  corsHeaders: Record<string, string>,
  options?: AuthOptions
): AuthResult {
  const source = options?.source ?? "auth";

  const internalSecret = Deno.env.get("INTERNAL_SECRET");
  if (!internalSecret) return { ok: true }; // Not configured — allow (backward compat)

  const secretHeader = req.headers.get("x-internal-secret");
  if (secretHeader !== internalSecret) {
    logAuthFailure(source, "invalid_or_missing_x_internal_secret", {
      hasHeader: !!secretHeader,
      headerLength: secretHeader?.length ?? 0,
    });
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Unauthorized: invalid or missing x-internal-secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      ),
    };
  }

  return { ok: true };
}

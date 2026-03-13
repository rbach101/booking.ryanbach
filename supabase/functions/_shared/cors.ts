// Shared CORS helper using BRAND.allowedOrigins.
// Import with: import { getCorsHeaders } from "../_shared/cors.ts";

import { BRAND } from "./brand.ts";

/** Build CORS headers from request Origin; validates against BRAND.allowedOrigins */
export function getCorsHeaders(req: Request, extraHeaders?: Record<string, string>): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed: string[] = [...BRAND.allowedOrigins];
  const appUrl = Deno.env.get("APP_URL");
  if (appUrl && !allowed.includes(appUrl)) allowed.push(appUrl);

  const isAllowed =
    allowed.includes(origin) ||
    origin.endsWith(".lovableproject.com") ||
    origin.endsWith(".lovable.app") ||
    origin.endsWith(".vercel.app");

  const allowedOrigin = isAllowed ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
    ...extraHeaders,
  };
}

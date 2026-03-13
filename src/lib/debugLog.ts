/**
 * Debug logging for runtime instrumentation (dev + prod).
 * Writes to Supabase debug_logs table. Export via Supabase SQL Editor or Lovable when needed.
 */
import { supabase } from "@/integrations/supabase/client";

export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  hypothesisId?: string
) {
  const payload = {
    location,
    message,
    data,
    hypothesis_id: hypothesisId ?? null,
  };
  // Use any-cast to avoid type issues with debug_logs not in generated types
  (supabase as any).from("debug_logs").insert(payload).then(() => {}).catch(() => {});
}

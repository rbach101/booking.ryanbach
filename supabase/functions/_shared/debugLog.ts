/**
 * Debug logging for Edge Functions. Writes to Supabase debug_logs table.
 * Export via Supabase SQL Editor or Lovable when needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function debugLog(
  supabase: any,
  location: string,
  message: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from("debug_logs").insert({
      location,
      message,
      data: data as Record<string, unknown>,
      hypothesis_id: null,
    });
  } catch {
    // Fire-and-forget; never fail the main flow
  }
}

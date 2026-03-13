import { supabase } from '@/integrations/supabase/client';

/**
 * Returns headers for authenticated Supabase Edge Function calls.
 * Includes Authorization (when session exists), apikey, and Content-Type.
 * Refreshes the session first to avoid "Invalid JWT" from expired tokens.
 */
export async function getEdgeFunctionHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  // Refresh if we have a session — ensures we use a valid, non-expired token
  let activeSession = session;
  if (session) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    activeSession = refreshed ?? session;
  }
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) headers['apikey'] = key;
  if (activeSession?.access_token) headers['Authorization'] = `Bearer ${activeSession.access_token}`;
  return headers;
}

import { supabase } from '@/integrations/supabase/client';

/**
 * Returns headers for authenticated Supabase Edge Function calls.
 * Includes Authorization (when session exists), apikey, and Content-Type.
 */
export async function getEdgeFunctionHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) headers['apikey'] = key;
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

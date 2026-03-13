/**
 * Extracts a user-friendly error message from Supabase Edge Function invoke errors.
 * When functions return 4xx/5xx with a JSON body like { error: "..." }, the client
 * gets a FunctionsHttpError. This utility parses the response body to surface the
 * actual error message to the user instead of a generic "Request failed" style message.
 */
export async function getFunctionErrorMessage(error: unknown): Promise<string> {
  if (!error) return 'An unexpected error occurred';

  // FunctionsHttpError has context = Response
  const err = error as { context?: Response; message?: string };
  if (err.context && typeof err.context?.json === 'function') {
    try {
      const body = await err.context.json();
      if (body && typeof body === 'object' && typeof body.error === 'string') {
        return body.error;
      }
      if (body && typeof body === 'object' && typeof body.message === 'string') {
        return body.message;
      }
    } catch {
      // JSON parse failed, fall through to message
    }
  }

  if (err.message && typeof err.message === 'string') {
    return err.message;
  }

  return 'An unexpected error occurred';
}

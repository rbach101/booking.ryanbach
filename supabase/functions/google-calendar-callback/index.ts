import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

// This is a simple redirect handler for the OAuth callback
serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // For POST health checks or non-GET requests, return OK
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Redirect back to the app with the code and state
  const appUrl = Deno.env.get('APP_URL') || 'https://booking.example.com';
  
  if (error) {
    return Response.redirect(`${appUrl}/settings?calendar_error=${encodeURIComponent(error)}`);
  }

  if (code && state) {
    return Response.redirect(`${appUrl}/settings?calendar_code=${encodeURIComponent(code)}&calendar_state=${encodeURIComponent(state)}`);
  }

  return Response.redirect(`${appUrl}/settings?calendar_error=missing_params`);
});

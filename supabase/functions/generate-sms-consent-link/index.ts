import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try {
    const b = await req.clone().json();
    if (b?.healthCheck) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch {
    /* not JSON, continue */
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify admin role
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'staff']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all active practitioners (phone no longer required)
    const { data: practitioners, error: practError } = await supabaseAdmin
      .from('practitioners')
      .select('id, name, phone, sms_consent, sms_consent_token, sms_consent_at')
      .eq('is_active', true);

    if (practError) throw practError;

    const results: { id: string; name: string; phone: string | null; status: string; url?: string }[] = [];

    for (const p of practitioners || []) {
      if (p.sms_consent) {
        results.push({
          id: p.id,
          name: p.name,
          phone: p.phone,
          status: 'already_consented',
        });
        continue;
      }

      // Generate or reuse existing token
      let token = p.sms_consent_token;
      if (!token) {
        token = crypto.randomUUID();
        const { error: updateError } = await supabaseAdmin
          .from('practitioners')
          .update({ sms_consent_token: token })
          .eq('id', p.id);

        if (updateError) {
          console.error(`Failed to set token for ${p.name}:`, updateError);
          results.push({ id: p.id, name: p.name, phone: p.phone, status: 'error' });
          continue;
        }
      }

      const url = `${BRAND.siteUrl}/sms-consent/confirm?token=${token}`;
      results.push({
        id: p.id,
        name: p.name,
        phone: p.phone,
        status: 'link_generated',
        url,
      });
    }

    return new Response(JSON.stringify({ success: true, practitioners: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-sms-consent-link:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

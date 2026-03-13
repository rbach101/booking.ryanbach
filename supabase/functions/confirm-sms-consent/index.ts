import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { token, phone } = await req.json();

    if (!token || typeof token !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Look up practitioner by token
    const { data: practitioner, error: lookupError } = await supabase
      .from('practitioners')
      .select('id, name, sms_consent, sms_consent_token')
      .eq('sms_consent_token', token)
      .single();

    if (lookupError || !practitioner) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired consent link' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (practitioner.sms_consent) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          already_consented: true,
          practitioner_name: practitioner.name,
          message: 'SMS consent was already confirmed' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Capture IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Validate phone if provided
    if (!phone || typeof phone !== 'string' || phone.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'A valid phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cleanPhone = phone.trim();

    // Record consent and save phone
    const { error: updateError } = await supabase
      .from('practitioners')
      .update({
        sms_consent: true,
        sms_consent_at: new Date().toISOString(),
        sms_consent_ip: ip,
        sms_consent_token: null, // Nullify token (one-time use)
        phone: cleanPhone,
      })
      .eq('id', practitioner.id);

    if (updateError) {
      console.error('Failed to record consent:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to record consent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Subscribe practitioner to Klaviyo SMS list (non-blocking)
    const KLAVIYO_PRIVATE_API_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
    const KLAVIYO_SMS_LIST_ID = Deno.env.get('KLAVIYO_SMS_LIST_ID');
    if (KLAVIYO_PRIVATE_API_KEY && KLAVIYO_SMS_LIST_ID) {
      try {
        const phoneForKlaviyo = cleanPhone.replace(/[^\d+]/g, '').startsWith('+')
          ? cleanPhone.replace(/[^\d+]/g, '')
          : `+1${cleanPhone.replace(/[^\d+]/g, '')}`;

        const { data: practFull } = await supabase
          .from('practitioners')
          .select('email, name')
          .eq('id', practitioner.id)
          .single();

        const nameParts = (practFull?.name || practitioner.name).trim().split(/\s+/);
        const klaviyoHeaders = {
          'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
          'Content-Type': 'application/json',
          'revision': '2024-10-15',
        };

        // Create/update profile (handle 409 duplicate gracefully)
        const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
          method: 'POST',
          headers: klaviyoHeaders,
          body: JSON.stringify({
            data: {
              type: 'profile',
              attributes: {
                email: practFull?.email || '',
                phone_number: phoneForKlaviyo,
                first_name: nameParts[0] || '',
                last_name: nameParts.slice(1).join(' ') || '',
              },
            },
          }),
        });

        if (profileRes.status === 201) {
          console.log('Klaviyo: practitioner profile created');
        } else if (profileRes.status === 409) {
          const dupBody = await profileRes.json();
          console.log('Klaviyo: practitioner profile already exists:', dupBody?.errors?.[0]?.meta?.duplicate_profile_id);
        } else {
          const errBody = await profileRes.text();
          console.error('Klaviyo profile creation failed:', profileRes.status, errBody);
        }

        // Subscribe to SMS list
        const subscribeRes = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
          method: 'POST',
          headers: klaviyoHeaders,
          body: JSON.stringify({
            data: {
              type: 'profile-subscription-bulk-create-job',
              attributes: {
                profiles: {
                  data: [{
                    type: 'profile',
                    attributes: {
                      email: practFull?.email || '',
                      phone_number: phoneForKlaviyo,
                      subscriptions: { sms: { marketing: { consent: 'SUBSCRIBED' } } },
                    },
                  }],
                },
              },
              relationships: {
                list: { data: { type: 'list', id: KLAVIYO_SMS_LIST_ID } },
              },
            },
          }),
        });

        if (subscribeRes.ok || subscribeRes.status === 202) {
          console.log('Klaviyo: practitioner SMS subscription created for', practFull?.email);
        } else {
          const errBody = await subscribeRes.text();
          console.error('Klaviyo SMS subscription failed:', subscribeRes.status, errBody);
        }
      } catch (klErr) {
        console.error('Klaviyo subscription error (non-blocking):', klErr);
      }
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: '00000000-0000-0000-0000-000000000000',
      action: 'sms_consent_confirmed',
      resource_type: 'practitioner',
      resource_id: practitioner.id,
      details: { practitioner_name: practitioner.name, ip_address: ip },
      ip_address: ip,
    });

    console.log(`SMS consent confirmed for ${practitioner.name} (${practitioner.id}) from IP ${ip}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        practitioner_name: practitioner.name,
        message: 'SMS notifications confirmed successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in confirm-sms-consent:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

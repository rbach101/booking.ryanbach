import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface SMSRequest {
  to: string;
  message: string;
  customerName: string;
  customerId?: string;
  bookingId?: string;
}

async function sendViaVonage(to: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get('VONAGE_API_KEY');
  const apiSecret = Deno.env.get('VONAGE_API_SECRET');
  const fromNumber = Deno.env.get('VONAGE_FROM_NUMBER');

  if (!apiKey || !apiSecret || !fromNumber) {
    console.error('Vonage credentials not configured');
    return false;
  }

  try {
    let cleanTo = to.replace(/[^\d+]/g, '');
    if (!cleanTo.startsWith('+')) {
      if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
      else cleanTo = '+' + cleanTo;
    }
    // Remove + for Vonage (expects digits only)
    const vonageTo = cleanTo.replace('+', '');

    const response = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        to: vonageTo,
        from: fromNumber,
        text: message,
      }),
    });

    const data = await response.json();
    const msg = data?.messages?.[0];

    if (msg?.status !== '0') {
      console.error('Vonage error:', msg?.['error-text'] || data);
      return false;
    }

    console.log('SMS sent via Vonage, message-id:', msg?.['message-id']);
    return true;
  } catch (error) {
    console.error('SMS error:', error);
    return false;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const userRoles = roles?.map(r => r.role) || [];
    if (!userRoles.includes('admin') && !userRoles.includes('staff')) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Deno.env.get('VONAGE_API_KEY') || !Deno.env.get('VONAGE_API_SECRET')) {
      return new Response(
        JSON.stringify({ error: 'SMS service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { to, message, customerName, customerId, bookingId }: SMSRequest = await req.json();

    if (!to || !message || !customerName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, message, customerName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending SMS to:', to, 'Customer:', customerName);

    const success = await sendViaVonage(to, message);

    if (!success) {
      await supabase.from('sms_messages').insert({
        customer_id: customerId || null,
        customer_phone: to,
        customer_name: customerName,
        direction: 'outbound',
        content: message,
        status: 'failed',
        sent_by: user.id,
        booking_id: bookingId || null,
      });

      return new Response(
        JSON.stringify({ error: 'Failed to send SMS' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: smsRecord, error: insertError } = await supabase
      .from('sms_messages')
      .insert({
        customer_id: customerId || null,
        customer_phone: to,
        customer_name: customerName,
        direction: 'outbound',
        content: message,
        status: 'sent',
        sent_by: user.id,
        booking_id: bookingId || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to log SMS:', insertError);
    }

    return new Response(
      JSON.stringify({ success: true, status: 'sent', smsRecord }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-sms:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

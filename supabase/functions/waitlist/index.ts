import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { BRAND } from "../_shared/brand.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');

interface WaitlistEntry {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  service_id: string;
  practitioner_id: string | null;
  preferred_days: number[];
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  status: string;
  services?: { name: string } | null;
  practitioners?: { name: string } | null;
}

async function sendSMS(to: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get('WIFITEXT_API_KEY');
  if (!apiKey) {
    console.log('WiFiText not configured');
    return false;
  }

  try {
    let cleanTo = to.replace(/[^\d]/g, '');
    if (cleanTo.length === 10) cleanTo = '1' + cleanTo;

    const encodedMessage = encodeURIComponent(message);
    const url = `https://www.wifitext.com/api/${apiKey}/${cleanTo}/${encodedMessage}/`;

    const response = await fetch(url);
    const data = await response.text();

    if (!response.ok) {
      console.error('WiFiText error:', data);
      return false;
    }

    console.log('SMS sent via WiFiText:', data);
    return true;
  } catch (error) {
    console.error('SMS error:', error);
    return false;
  }
}

const EMAIL_FOOTER_HTML = `
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 4px 0;">${BRAND.name}</p>
    <p style="margin: 4px 0;">${BRAND.address}</p>
    <p style="margin: 4px 0;">${BRAND.supportEmail}</p>
    <p style="margin: 8px 0;">You are receiving this email because you joined our waitlist.</p>
  </div>
`;

const EMAIL_FOOTER_TEXT = `\n\n---\n${BRAND.name}\n${BRAND.address}\n${BRAND.supportEmail}\nYou are receiving this email because you joined our waitlist.`;

async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!resendApiKey) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: BRAND.fromSupport,
        to: [to],
        subject,
        html: html + EMAIL_FOOTER_HTML,
        ...(text && { text: text + EMAIL_FOOTER_TEXT }),
      }),
    });
    return response.ok;
  } catch {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // POST - Join waitlist (public)
    if (req.method === 'POST' && !action) {
      const body = await req.json();
      const {
        client_name,
        client_email,
        client_phone,
        service_id,
        practitioner_id,
        preferred_days,
        preferred_time_start,
        preferred_time_end,
        date_range_start,
        date_range_end,
        notes,
      } = body;

      if (!client_name || !client_email || !service_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const expiresAt = date_range_end 
        ? new Date(date_range_end + 'T23:59:59').toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('waitlist')
        .insert({
          client_name,
          client_email,
          client_phone: client_phone || null,
          service_id,
          practitioner_id: practitioner_id || null,
          preferred_days: preferred_days || [],
          preferred_time_start: preferred_time_start || null,
          preferred_time_end: preferred_time_end || null,
          date_range_start: date_range_start || null,
          date_range_end: date_range_end || null,
          notes: notes || null,
          expires_at: expiresAt,
        })
        .select()
        .single();

      if (error) throw error;
      await debugLog(supabase, "waitlist:waitlist.insert", "Waitlist entry saved", { waitlist_id: data.id, service_id, client_email });

      return new Response(JSON.stringify({ success: true, waitlist_id: data.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST with action=notify - Notify waitlist when slot opens (staff only)
    if (req.method === 'POST' && action === 'notify') {
      const body = await req.json();
      const { date, start_time, end_time, practitioner_id, service_id } = body;

      if (!date || !start_time || !service_id) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: date, start_time, service_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const slotDate = new Date(date + 'T00:00:00');
      const dayOfWeek = slotDate.getDay();

      let query = supabase
        .from('waitlist')
        .select(`
          *,
          services(name),
          practitioners(name)
        `)
        .eq('status', 'active')
        .eq('service_id', service_id);

      if (practitioner_id) {
        query = query.or(`practitioner_id.eq.${practitioner_id},practitioner_id.is.null`);
      }

      const { data: waitlistEntries, error } = await query;

      if (error) throw error;

      const notified: string[] = [];

      for (const entry of (waitlistEntries || []) as WaitlistEntry[]) {
        if (entry.preferred_days?.length > 0 && !entry.preferred_days.includes(dayOfWeek)) {
          continue;
        }

        if (entry.date_range_start && date < entry.date_range_start) continue;
        if (entry.date_range_end && date > entry.date_range_end) continue;

        if (entry.preferred_time_start && start_time < entry.preferred_time_start) continue;
        if (entry.preferred_time_end && start_time > entry.preferred_time_end) continue;

        const serviceName = entry.services?.name || 'your requested service';
        const practitionerName = entry.practitioners?.name || 'an available therapist';
        const formattedDate = slotDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const formattedTime = new Date(`2000-01-01T${start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

        const smsMessage = `Great news, ${entry.client_name}! An opening just became available for ${serviceName} on ${formattedDate} at ${formattedTime}. Book quickly before it's gone! Reply STOP to unsubscribe.`;

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4a7c59;">Good News!</h2>
            <p>Hi ${entry.client_name},</p>
            <p>An opening just became available that matches your waitlist preferences:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Service:</strong> ${serviceName}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Time:</strong> ${formattedTime}</p>
              <p><strong>Therapist:</strong> ${practitionerName}</p>
            </div>
            <p>Book quickly before this slot is taken!</p>
            <p>Best,<br>${BRAND.name}</p>
          </div>
        `;

        if (entry.client_phone) await sendSMS(entry.client_phone, smsMessage);
        if (entry.client_email) {
          const emailText = `Hi ${entry.client_name},\n\nAn opening just became available that matches your waitlist preferences:\n\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\nTherapist: ${practitionerName}\n\nBook quickly before this slot is taken!\n\nBest,\n${BRAND.name}`;
          await sendEmail(entry.client_email, 'Opening Available!', emailHtml, emailText);
        }

        await supabase
          .from('waitlist')
          .update({ status: 'notified', notified_at: new Date().toISOString() })
          .eq('id', entry.id);

        notified.push(entry.id);
      }

      return new Response(JSON.stringify({ success: true, notified_count: notified.length, notified_ids: notified }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Waitlist error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

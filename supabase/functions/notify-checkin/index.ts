import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { BRAND } from "../_shared/brand.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_NOTIFICATION_EMAIL = BRAND.supportEmail;
// SMS now per-practitioner via sms_consent column (replaces global SMS_ENABLED flag)

interface CheckinNotificationRequest {
  bookingId: string;
  clientName: string;
  serviceName: string;
  startTime: string;
  practitionerId?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function sendSMS(to: string, message: string): Promise<boolean> {
  const apiKey = Deno.env.get('VONAGE_API_KEY');
  const apiSecret = Deno.env.get('VONAGE_API_SECRET');
  const fromNumber = Deno.env.get('VONAGE_FROM_NUMBER');

  if (!apiKey || !apiSecret || !fromNumber) {
    console.log('Vonage not configured, skipping SMS');
    return false;
  }

  try {
    let cleanTo = to.replace(/[^\d+]/g, '');
    if (!cleanTo.startsWith('+')) {
      if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
      else cleanTo = '+' + cleanTo;
    }
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
    console.error('Error sending SMS:', error);
    return false;
  }
}

async function sendSMSWithRetry(to: string, message: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendSMS(to, message);
    if (result) return true;
    if (attempt < maxAttempts) {
      console.log(`SMS retry ${attempt}/${maxAttempts} for ${to}`);
      await delay(2000 * attempt);
    }
  }
  return false;
}

async function sendCheckinEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend not configured, skipping email');
    return false;
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: BRAND.fromSupport,
      to: [to],
      subject,
      html,
      ...(text && { text }),
    });
    if (error) { console.error('Email failed:', error); return false; }
    console.log('Check-in email sent to:', to);
    return true;
  } catch (error) { console.error('Email error:', error); return false; }
}

async function sendEmailWithRetry(to: string, subject: string, html: string, text?: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendCheckinEmail(to, subject, html, text);
    if (result) return true;
    if (attempt < maxAttempts) {
      console.log(`Email retry ${attempt}/${maxAttempts} for ${to}`);
      await delay(2000 * attempt);
    }
  }
  return false;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const { bookingId, clientName, serviceName, startTime, practitionerId }: CheckinNotificationRequest = await req.json();

    if (!bookingId || !clientName) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing check-in notification for booking ${bookingId}, client: ${clientName}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const formatTime = (timeStr: string) => {
      const [hours, minutes] = timeStr.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${minutes} ${ampm}`;
    };

    const formattedTime = startTime ? formatTime(startTime) : 'their appointment';

    let practitionerPhone: string | null = null;
    let practitionerName: string | null = null;
    let practitionerSmsConsent = false;

    if (practitionerId) {
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('name, phone, user_id, sms_consent')
        .eq('id', practitionerId)
        .single();

      if (practitioner) {
        practitionerName = practitioner.name;
        practitionerPhone = practitioner.phone;
        practitionerSmsConsent = practitioner.sms_consent === true;
      }
    }

    const smsResults: { recipient: string; success: boolean }[] = [];

    // SMS to practitioner — only if they consented
    if (practitionerSmsConsent && practitionerPhone) {
      const message = `🔔 Check-in Alert: ${clientName} has arrived for their ${serviceName || 'appointment'} at ${formattedTime}.`;
      const success = await sendSMSWithRetry(practitionerPhone, message);
      smsResults.push({ recipient: practitionerName || 'Practitioner', success });

      if (success) {
        await supabase.from('sms_messages').insert({
          customer_phone: practitionerPhone,
          customer_name: practitionerName || 'Practitioner',
          direction: 'outbound',
          content: message,
          status: 'sent',
          booking_id: bookingId,
        });
      } else {
        await supabase.from('audit_logs').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          action: 'notification_failed',
          resource_type: 'booking',
          resource_id: bookingId,
          details: { type: 'checkin_sms', recipient: practitionerName, channel: 'sms', attempts: 3 },
        });
      }
    }

    // SMS to admin practitioners — only if they consented
    {
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (adminRoles && adminRoles.length > 0) {
        const adminUserIds = adminRoles.map(r => r.user_id);

        const { data: adminPractitioners } = await supabase
          .from('practitioners')
          .select('name, phone, user_id, sms_consent')
          .in('user_id', adminUserIds)
          .eq('sms_consent', true)
          .not('phone', 'is', null);

        if (adminPractitioners) {
          for (const admin of adminPractitioners) {
            if (admin.phone && admin.phone !== practitionerPhone) {
              const message = `🔔 Check-in: ${clientName} arrived for ${serviceName || 'appointment'}${practitionerName ? ` with ${practitionerName}` : ''} at ${formattedTime}.`;
              const success = await sendSMSWithRetry(admin.phone, message);
              smsResults.push({ recipient: admin.name, success });

              if (success) {
                await supabase.from('sms_messages').insert({
                  customer_phone: admin.phone,
                  customer_name: admin.name,
                  direction: 'outbound',
                  content: message,
                  status: 'sent',
                  booking_id: bookingId,
                });
              } else {
                await supabase.from('audit_logs').insert({
                  user_id: '00000000-0000-0000-0000-000000000000',
                  action: 'notification_failed',
                  resource_type: 'booking',
                  resource_id: bookingId,
                  details: { type: 'checkin_sms', recipient: admin.name, channel: 'sms', attempts: 3 },
                });
              }
            }
          }
        }
      }
    }

    // Send check-in email notification (always active)
    const checkinEmailSubject = `🔔 Client Check-In: ${clientName}`;
    const checkinEmailHtml = `
      <h2>Client Check-In Alert</h2>
      <p><strong>${clientName}</strong> has checked in for their <strong>${serviceName || 'appointment'}</strong> at <strong>${formattedTime}</strong>${practitionerName ? ` with ${practitionerName}` : ''}.</p>
    `;
    const checkinEmailText = `Client Check-In: ${clientName} has arrived for ${serviceName || 'appointment'} at ${formattedTime}${practitionerName ? ' with ' + practitionerName : ''}.`;
    const emailSent = await sendEmailWithRetry(ADMIN_NOTIFICATION_EMAIL, checkinEmailSubject, checkinEmailHtml, checkinEmailText);

    if (!emailSent) {
      await supabase.from('audit_logs').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        action: 'notification_failed',
        resource_type: 'booking',
        resource_id: bookingId,
        details: { type: 'checkin_email', recipient: ADMIN_NOTIFICATION_EMAIL, channel: 'email', attempts: 3 },
      });
    }

    console.log('Check-in notification results:', { smsResults, emailSent });

    // ── Klaviyo server-side: track Client Checked In event ──
    const KLAVIYO_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
    if (KLAVIYO_KEY) {
      try {
        // Get booking details for Klaviyo event
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('client_email, client_phone, booking_date, start_time, service_id')
          .eq('id', bookingId)
          .single();

        if (bookingData) {
          // Identify/update profile
          const nameParts = clientName.trim().split(/\s+/);
          const phone = bookingData.client_phone
            ? (bookingData.client_phone.replace(/[^\d+]/g, '').startsWith('+')
                ? bookingData.client_phone.replace(/[^\d+]/g, '')
                : '+1' + bookingData.client_phone.replace(/\D/g, ''))
            : undefined;

          await fetch('https://a.klaviyo.com/api/profiles/', {
            method: 'POST',
            headers: {
              'Authorization': `Klaviyo-API-Key ${KLAVIYO_KEY}`,
              'Content-Type': 'application/json',
              'revision': '2024-10-15',
            },
            body: JSON.stringify({
              data: {
                type: 'profile',
                attributes: {
                  email: bookingData.client_email,
                  first_name: nameParts[0] || '',
                  last_name: nameParts.slice(1).join(' ') || '',
                  phone_number: phone,
                },
              },
            }),
          }).then(r => r.text()); // consume body

          // Track event
          await fetch('https://a.klaviyo.com/api/events/', {
            method: 'POST',
            headers: {
              'Authorization': `Klaviyo-API-Key ${KLAVIYO_KEY}`,
              'Content-Type': 'application/json',
              'revision': '2024-10-15',
            },
            body: JSON.stringify({
              data: {
                type: 'event',
                attributes: {
                  metric: { data: { type: 'metric', attributes: { name: 'Client Checked In' } } },
                  profile: { data: { type: 'profile', attributes: { email: bookingData.client_email } } },
                  properties: {
                    BookingId: bookingId,
                    ServiceName: serviceName || 'Appointment',
                    BookingDate: bookingData.booking_date,
                    StartTime: formattedTime,
                    PractitionerName: practitionerName || 'Staff',
                  },
                  time: new Date().toISOString(),
                  unique_id: `checkin_${bookingId}`,
                },
              },
            }),
          }).then(r => r.text());

          console.log('Klaviyo: Client Checked In event tracked for', bookingData.client_email);
        }
      } catch (klErr) {
        console.error('Klaviyo tracking error (non-blocking):', klErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        notifications: smsResults,
        emailSent,
        message: `Check-in notification processed (email: ${emailSent})`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-checkin:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

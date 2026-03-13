import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { getCorsHeaders } from "../_shared/cors.ts";
import { deduplicatePendingDeposits } from "../_shared/booking-payments.ts";
import { BRAND } from "../_shared/brand.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_NOTIFICATION_EMAIL = BRAND.supportEmail;
// SMS now per-practitioner via sms_consent column (replaces global SMS_ENABLED flag)

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
    console.error('SMS error:', error);
    return false;
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

const EMAIL_FOOTER_HTML = `
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 4px 0;">${BRAND.name}</p>
    <p style="margin: 4px 0;">${BRAND.address}</p>
    <p style="margin: 4px 0;">${BRAND.supportEmail}</p>
    <p style="margin: 8px 0;">You are receiving this email because you are a staff member.</p>
  </div>
`;

const EMAIL_FOOTER_TEXT = `\n\n---\n${BRAND.name}\n${BRAND.address}\n${BRAND.supportEmail}\nYou are receiving this email because you are a staff member.`;

async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
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
      html: html + EMAIL_FOOTER_HTML,
      ...(text && { text: text + EMAIL_FOOTER_TEXT }),
    });

    if (error) {
      console.error('Email failed:', error);
      return false;
    }
    
    console.log('Email sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('Email error:', error);
    return false;
  }
}

async function sendEmailWithRetry(to: string, subject: string, html: string, text?: string, maxAttempts = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendEmail(to, subject, html, text);
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { bookingId, partialApproval, approverName, reschedule } = await req.json() as { bookingId: string; partialApproval?: boolean; approverName?: string; reschedule?: boolean };

    console.log('Sending staff notification for booking:', bookingId, { reschedule, partialApproval });

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        practitioners:practitioner_id (id, name, email, phone, user_id, sms_consent),
        practitioner2:practitioner_2_id (id, name, email, phone, user_id, sms_consent),
        services:service_id (name, duration, price),
        rooms:room_id (name)
      `)
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      console.error('Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check notification settings
    const { data: settings } = await supabase
      .from('notification_settings')
      .select('*')
      .eq('event_type', 'new_booking_staff')
      .single();

    const emailEnabled = settings?.email_enabled ?? true;

    // Format booking details
    const bookingDate = new Date(booking.booking_date + 'T00:00:00');
    const formattedDate = bookingDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
    const [hours, minutes] = booking.start_time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    const formattedTime = `${hour12}:${minutes} ${ampm}`;

    const rawServices = booking.services;
    const services = Array.isArray(rawServices) ? rawServices[0] : rawServices;
    const serviceName = services?.name || 'Massage Session';
    const rawPractitioners = booking.practitioners;
    const practitioner = Array.isArray(rawPractitioners) ? rawPractitioners[0] : rawPractitioners;
    const rawRooms = booking.rooms;
    const room = Array.isArray(rawRooms) ? rawRooms[0] : rawRooms;
    const rawPractitioner2 = booking.practitioner2;
    const practitioner2Unwrapped = Array.isArray(rawPractitioner2) ? rawPractitioner2[0] : rawPractitioner2;
    // Override booking.practitioner2 for downstream usage
    booking.practitioner2 = practitioner2Unwrapped;

    const dashboardUrl = `${BRAND.siteUrl}/dashboard?approve=${bookingId}`;
    const confirmUrl = dashboardUrl;
    const rescheduleUrl = dashboardUrl;

    // Handle partial approval notification for couples massage
    if (partialApproval && approverName) {
      const partialHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#667B68 0%,#4a5a4b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
<h1 style="color:white;margin:0;font-size:24px;">Your Co-Therapist Approved ✓</h1></td></tr>
<tr><td style="padding:32px;">
<p style="color:#374151;font-size:16px;margin:0 0 24px;"><strong>${approverName}</strong> has approved the couples massage booking. Your confirmation is needed to finalize it.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;"><tr><td>
<table width="100%" cellpadding="8" cellspacing="0">
<tr><td style="color:#6b7280;font-size:14px;width:120px;">Client:</td><td style="color:#111827;font-size:14px;font-weight:600;">${booking.client_name}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Service:</td><td style="color:#111827;font-size:14px;font-weight:600;">${serviceName}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Date:</td><td style="color:#111827;font-size:14px;font-weight:600;">${formattedDate}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Time:</td><td style="color:#111827;font-size:14px;font-weight:600;">${formattedTime}</td></tr>
</table></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center"><a href="${confirmUrl}" style="display:inline-block;background:#22c55e;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">✓ Approve & Confirm</a></td></tr>
</table>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;">
<p style="color:#667B68;font-size:14px;margin:0;font-weight:600;">${BRAND.name}</p></td></tr>
</table></td></tr></table></body></html>`;

      // Send to both practitioners (the one who hasn't approved)
      const emailsSentTo = new Set<string>();
      const allPractitioners = [booking.practitioners, booking.practitioner2].filter(Boolean);
      for (const p of allPractitioners) {
        if (p?.email && !emailsSentTo.has(p.email.toLowerCase())) {
          const partialText = `${approverName} has approved the couples massage for ${booking.client_name} (${serviceName} on ${formattedDate} at ${formattedTime}). Your confirmation is needed: ${confirmUrl}`;
          await sendEmailWithRetry(p.email, `Action Needed: Your co-therapist approved — ${booking.client_name}'s couples massage`, partialHtml, partialText);
          emailsSentTo.add(p.email.toLowerCase());
          await delay(1100);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Partial approval notification sent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle reschedule notification — sends to the CLIENT
    if (reschedule) {
      // Clean up duplicate pending deposits — keep only the most recent one
      const expired = await deduplicatePendingDeposits(supabase, bookingId);
      if (expired > 0) {
        console.log('Expired duplicate pending deposits on reschedule:', expired, 'booking:', bookingId);
      }

      const practitionerName = practitioner?.name || 'your therapist';
      const rescheduleHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#667B68 0%,#4a5a4b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
<h1 style="color:white;margin:0;font-size:24px;">Appointment Update</h1></td></tr>
<tr><td style="padding:32px;">
<p style="color:#374151;font-size:16px;margin:0 0 24px;">Hi ${booking.client_name},</p>
<p style="color:#374151;font-size:16px;margin:0 0 24px;">Your appointment has been updated. Here are your new details:</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;"><tr><td>
<table width="100%" cellpadding="8" cellspacing="0">
<tr><td style="color:#6b7280;font-size:14px;width:120px;">Service:</td><td style="color:#111827;font-size:14px;font-weight:600;">${serviceName}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Date:</td><td style="color:#111827;font-size:14px;font-weight:600;">${formattedDate}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Time:</td><td style="color:#111827;font-size:14px;font-weight:600;">${formattedTime}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Practitioner:</td><td style="color:#111827;font-size:14px;font-weight:600;">${practitionerName}</td></tr>
${room ? `<tr><td style="color:#6b7280;font-size:14px;">Room:</td><td style="color:#111827;font-size:14px;">${room.name}</td></tr>` : ''}
</table></td></tr></table>
<p style="color:#6b7280;font-size:14px;margin:0;">If you have any questions, please contact us at ${BRAND.supportEmail}.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;">
<p style="color:#667B68;font-size:14px;margin:0;font-weight:600;">${BRAND.name}</p>
<p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">${BRAND.address}</p>
</td></tr>
</table></td></tr></table></body></html>`;

      const rescheduleText = `Hi ${booking.client_name},\n\nYour appointment has been updated.\n\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\nPractitioner: ${practitionerName}\n\nQuestions? Contact ${BRAND.supportEmail}\n\n${BRAND.name}\n${BRAND.address}`;

      const sent = await sendEmailWithRetry(
        booking.client_email,
        `Appointment Update — ${serviceName} on ${formattedDate}`,
        rescheduleHtml,
        rescheduleText
      );

      console.log('Reschedule notification sent to client:', booking.client_email, sent);

      // Send Klaviyo "Booking Rescheduled" event so SMS reminder flows use updated time
      const KLAVIYO_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
      if (KLAVIYO_KEY && booking.consent_sms && booking.client_phone) {
        try {
          const eventRes = await fetch('https://a.klaviyo.com/api/events/', {
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
                  metric: { data: { type: 'metric', attributes: { name: 'Booking Rescheduled' } } },
                  profile: { data: { type: 'profile', attributes: { email: booking.client_email } } },
                  properties: {
                    BookingId: bookingId,
                    ServiceName: serviceName,
                    BookingDate: formattedDate,
                    StartTime: formattedTime,
                  },
                  time: new Date().toISOString(),
                  unique_id: `rescheduled_${bookingId}`,
                },
              },
            }),
          });
          if (!eventRes.ok) {
            console.error('Klaviyo Booking Rescheduled event failed:', eventRes.status, await eventRes.text());
          } else {
            console.log('Klaviyo: Booking Rescheduled event tracked for', booking.client_email);
          }
        } catch (klErr) {
          console.error('Klaviyo reschedule tracking error (non-blocking):', klErr);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: sent ? 'Reschedule notification sent to client' : 'Failed to send notification' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { sms: boolean[]; email: boolean[]; inApp: boolean[] } = {
      sms: [],
      email: [],
      inApp: []
    };

    // Build email HTML with action buttons
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667B68 0%, #4a5a4b 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 24px;">New Booking Request</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="color: #374151; font-size: 16px; margin: 0 0 24px;">A new appointment request requires your attention:</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="8" cellspacing="0">
                      <tr><td style="color: #6b7280; font-size: 14px; width: 120px;">Client:</td><td style="color: #111827; font-size: 14px; font-weight: 600;">${booking.client_name}</td></tr>
                      <tr><td style="color: #6b7280; font-size: 14px;">Email:</td><td style="color: #111827; font-size: 14px;">${booking.client_email}</td></tr>
                      <tr><td style="color: #6b7280; font-size: 14px;">Phone:</td><td style="color: #111827; font-size: 14px;">${booking.client_phone || 'Not provided'}</td></tr>
                      <tr><td style="color: #6b7280; font-size: 14px;">Service:</td><td style="color: #111827; font-size: 14px; font-weight: 600;">${serviceName}</td></tr>
                      <tr><td style="color: #6b7280; font-size: 14px;">Date:</td><td style="color: #111827; font-size: 14px; font-weight: 600;">${formattedDate}</td></tr>
                      <tr><td style="color: #6b7280; font-size: 14px;">Time:</td><td style="color: #111827; font-size: 14px; font-weight: 600;">${formattedTime}</td></tr>
                      ${practitioner ? `<tr><td style="color: #6b7280; font-size: 14px;">Practitioner:</td><td style="color: #111827; font-size: 14px;">${practitioner.name}</td></tr>` : ''}
                      ${room ? `<tr><td style="color: #6b7280; font-size: 14px;">Room:</td><td style="color: #111827; font-size: 14px;">${room.name}</td></tr>` : ''}
                      ${booking.notes ? `<tr><td style="color: #6b7280; font-size: 14px; vertical-align: top;">Notes:</td><td style="color: #111827; font-size: 14px;">${booking.notes}</td></tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td align="center" style="padding-bottom: 12px;"><a href="${confirmUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">✓ Confirm Appointment</a></td></tr>
                <tr><td align="center" style="padding-bottom: 12px;"><a href="${rescheduleUrl}" style="display: inline-block; background: #f59e0b; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">📅 Reschedule</a></td></tr>
                <tr><td align="center"><a href="${dashboardUrl}" style="display: inline-block; background: #6b7280; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">View in Dashboard</a></td></tr>
              </table>
              <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; text-align: center;">These links expire in 48 hours. After that, please use the dashboard.</p>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
              <p style="color: #667B68; font-size: 14px; margin: 0; font-weight: 600;">${BRAND.name}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailsSentTo = new Set<string>();

    // Send to assigned practitioner
    if (practitioner) {
      if (emailEnabled && practitioner.email) {
        const emailText = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'Not provided'}\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\n${practitioner ? 'Practitioner: ' + practitioner.name + '\n' : ''}${room ? 'Room: ' + room.name + '\n' : ''}${booking.notes ? 'Notes: ' + booking.notes + '\n' : ''}\nConfirm: ${confirmUrl}\nReschedule: ${rescheduleUrl}\nDashboard: ${dashboardUrl}`;
        const sent = await sendEmailWithRetry(
          practitioner.email,
          `New Booking Request: ${booking.client_name} - ${serviceName} on ${formattedDate}`,
          emailHtml,
          emailText
        );
        results.email.push(sent);
        emailsSentTo.add(practitioner.email.toLowerCase());
        if (!sent) {
          await supabase.from('audit_logs').insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'notification_failed',
            resource_type: 'booking',
            resource_id: bookingId,
            details: { function: 'notify-staff-booking', type: 'new_booking_staff', recipient: practitioner.email, channel: 'email', attempts: 3 },
          });
        }
      }

      // SMS — only if practitioner consented
      if (practitioner.sms_consent && practitioner.phone) {
        const smsMessage = `New booking: ${booking.client_name} for ${serviceName} on ${formattedDate} at ${formattedTime}. Confirm: ${confirmUrl}`;
        const sent = await sendSMS(practitioner.phone, smsMessage);
        results.sms.push(sent);
      }

      // Create in-app notification
      if (practitioner.user_id) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: practitioner.user_id,
            type: 'new_booking',
            title: 'New Booking Request',
            message: `${booking.client_name} has requested a ${serviceName} on ${formattedDate} at ${formattedTime}`,
            booking_id: bookingId,
            action_url: `/dashboard?approve=${bookingId}`
          });
        results.inApp.push(!notifError);
      }
    }

    // Send to 2nd practitioner (couples massage)
    const practitioner2 = booking.practitioner2;
    if (practitioner2 && practitioner2.id !== practitioner?.id) {
      if (emailEnabled && practitioner2.email && !emailsSentTo.has(practitioner2.email.toLowerCase())) {
        await delay(1100);
        const emailText = `New Couples Massage Booking Request\n\nYou are assigned as the second practitioner.\n\nClient: ${booking.client_name}\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\n\nDashboard: ${dashboardUrl}`;
        const sent = await sendEmailWithRetry(
          practitioner2.email,
          `New Booking Request (Couples): ${booking.client_name} - ${serviceName} on ${formattedDate}`,
          emailHtml,
          emailText
        );
        results.email.push(sent);
        emailsSentTo.add(practitioner2.email.toLowerCase());
        if (!sent) {
          await supabase.from('audit_logs').insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'notification_failed',
            resource_type: 'booking',
            resource_id: bookingId,
            details: { function: 'notify-staff-booking', type: 'new_booking_staff_p2', recipient: practitioner2.email, channel: 'email', attempts: 3 },
          });
        }
      }

      // SMS — only if 2nd practitioner consented
      if (practitioner2.sms_consent && practitioner2.phone) {
        const smsMessage = `New couples booking: ${booking.client_name} for ${serviceName} on ${formattedDate} at ${formattedTime}. You are the 2nd practitioner. View: ${confirmUrl}`;
        const sent = await sendSMS(practitioner2.phone, smsMessage);
        results.sms.push(sent);
      }

      if (practitioner2.user_id) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: practitioner2.user_id,
            type: 'new_booking',
            title: 'New Couples Massage Booking',
            message: `${booking.client_name} has requested a ${serviceName} on ${formattedDate} at ${formattedTime} (you are the 2nd practitioner)`,
            booking_id: bookingId,
            action_url: `/dashboard?approve=${bookingId}`
          });
        results.inApp.push(!notifError);
      }
    }

    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminUsers && adminUsers.length > 0) {
      const adminUserIds = adminUsers.map(u => u.user_id);
      const { data: adminProfiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', adminUserIds);

      for (const admin of adminProfiles || []) {
        if (practitioner?.user_id === admin.id) continue;

        if (emailEnabled && admin.email) {
          await delay(1100);
          const emailText = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'Not provided'}\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\n\nConfirm: ${confirmUrl}\nReschedule: ${rescheduleUrl}\nDashboard: ${dashboardUrl}`;
          const sent = await sendEmailWithRetry(
            admin.email,
            `New Booking Request: ${booking.client_name} - ${serviceName} on ${formattedDate}`,
            emailHtml,
            emailText
          );
          results.email.push(sent);
          emailsSentTo.add(admin.email.toLowerCase());
          if (!sent) {
            await supabase.from('audit_logs').insert({
              user_id: '00000000-0000-0000-0000-000000000000',
              action: 'notification_failed',
              resource_type: 'booking',
              resource_id: bookingId,
              details: { function: 'notify-staff-booking', type: 'new_booking_admin', recipient: admin.email, channel: 'email', attempts: 3 },
            });
          }
        }

        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: admin.id,
            type: 'new_booking',
            title: 'New Booking Request',
            message: `${booking.client_name} has requested a ${serviceName} on ${formattedDate} at ${formattedTime}`,
            booking_id: bookingId,
            action_url: `/dashboard?approve=${bookingId}`
          });
        results.inApp.push(!notifError);
      }
    }

    // Always CC support email if not already notified
    if (emailEnabled && !emailsSentTo.has(ADMIN_NOTIFICATION_EMAIL.toLowerCase())) {
      await delay(1100);
      const emailText = `New Booking Request\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'Not provided'}\nService: ${serviceName}\nDate: ${formattedDate}\nTime: ${formattedTime}\n\nConfirm: ${confirmUrl}\nReschedule: ${rescheduleUrl}\nDashboard: ${dashboardUrl}`;
      const sent = await sendEmailWithRetry(
        ADMIN_NOTIFICATION_EMAIL,
        `New Booking Request: ${booking.client_name} - ${serviceName} on ${formattedDate}`,
        emailHtml,
        emailText
      );
      results.email.push(sent);
      console.log('Sent copy to admin email:', ADMIN_NOTIFICATION_EMAIL, sent);
    }

    console.log('Staff notification results:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        message: 'Staff notifications sent'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-staff-booking:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

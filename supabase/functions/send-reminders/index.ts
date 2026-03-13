import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
// SMS now per-booking consent_sms check (replaces global SMS_ENABLED flag)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Booking {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  consent_sms: boolean;
  practitioner: { name: string }[] | null;
  services: { name: string }[] | null;
}

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
    <p style="margin: 8px 0;">You are receiving this email because you have an appointment with us.</p>
  </div>
`;

const EMAIL_FOOTER_TEXT = `\n\n---\n${BRAND.name}\n${BRAND.address}\n${BRAND.supportEmail}\nYou are receiving this email because you have an appointment with us.`;

async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!resendApiKey) {
    console.log('Resend API key not configured');
    return false;
  }

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

    if (!response.ok) {
      const error = await response.text();
      console.error('Resend error:', error);
      return false;
    }

    console.log('Email sent to:', to);
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

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
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
    
    const now = new Date();
    const hawaiiOffset = -10 * 60;
    const localOffset = now.getTimezoneOffset();
    const hawaiiTime = new Date(now.getTime() + (localOffset - hawaiiOffset) * 60 * 1000);
    
    const today = hawaiiTime.toISOString().split('T')[0];
    const tomorrow = new Date(hawaiiTime.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log('Checking reminders for today:', today, 'and tomorrow:', tomorrow);
    console.log('Current Hawaii time:', hawaiiTime.toISOString());

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        client_name,
        client_email,
        client_phone,
        booking_date,
        start_time,
        end_time,
        status,
        consent_sms,
        practitioner:practitioners!bookings_practitioner_id_fkey(name),
        services(name)
      `)
      .in('booking_date', [today, tomorrow])
      .eq('status', 'confirmed')
      .order('booking_date')
      .order('start_time');

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError);
      throw bookingsError;
    }

    console.log(`Found ${bookings?.length || 0} upcoming confirmed bookings`);

    const results = {
      reminders_24h: 0,
      reminders_1h: 0,
      skipped: 0,
      errors: 0,
    };

    for (const booking of (bookings || []) as Booking[]) {
      const bookingDateTime = new Date(`${booking.booking_date}T${booking.start_time}`);
      const hoursUntilAppointment = (bookingDateTime.getTime() - hawaiiTime.getTime()) / (1000 * 60 * 60);

      console.log(`Booking ${booking.id}: ${booking.client_name} at ${booking.booking_date} ${booking.start_time}`);
      console.log(`  Hours until appointment: ${hoursUntilAppointment.toFixed(1)}`);

      const { data: existingReminders } = await supabase
        .from('appointment_reminders')
        .select('reminder_type')
        .eq('booking_id', booking.id);

      const sentTypes = new Set((existingReminders || []).map(r => r.reminder_type));

      if (hoursUntilAppointment >= 23 && hoursUntilAppointment <= 25 && !sentTypes.has('24h')) {
        console.log(`  Sending 24h reminder...`);
        await sendReminder(supabase, booking, '24h');
        results.reminders_24h++;
      }
      else if (hoursUntilAppointment >= 0.5 && hoursUntilAppointment <= 1.5 && !sentTypes.has('1h')) {
        console.log(`  Sending 1h reminder...`);
        await sendReminder(supabase, booking, '1h');
        results.reminders_1h++;
      }
      else {
        console.log(`  Skipped (already sent or outside window)`);
        results.skipped++;
      }
    }

    console.log('Reminder results:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in send-reminders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function sendReminder(supabase: any, booking: Booking, reminderType: '24h' | '1h') {
  const rawServices = booking.services as any;
  const services = Array.isArray(rawServices) ? rawServices[0] : rawServices;
  const serviceName = services?.name || 'your appointment';
  const rawPractitioner = booking.practitioner as any;
  const practitioner = Array.isArray(rawPractitioner) ? rawPractitioner[0] : rawPractitioner;
  const practitionerName = practitioner?.name || 'your therapist';
  const appointmentDate = formatDate(booking.booking_date);
  const appointmentTime = formatTime(booking.start_time);

  const timeLabel = reminderType === '24h' ? 'tomorrow' : 'in 1 hour';
  
  const smsMessage = `Hi ${booking.client_name}! This is a reminder that your ${serviceName} appointment is ${timeLabel} at ${appointmentTime} with ${practitionerName}. We look forward to seeing you! - ${BRAND.name}`;

  const emailSubject = reminderType === '24h' 
    ? `Appointment Reminder: ${serviceName} Tomorrow`
    : `Appointment Starting Soon: ${serviceName}`;

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #4a7c59, #6b9080); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .detail-row { display: flex; margin: 10px 0; }
        .label { font-weight: bold; width: 120px; color: #666; }
        .footer { text-align: center; margin-top: 30px; color: #888; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">Appointment Reminder</h1>
          <p style="margin: 10px 0 0;">${BRAND.name}</p>
        </div>
        <div class="content">
          <p>Hi ${booking.client_name},</p>
          <p>This is a friendly reminder about your upcoming appointment ${timeLabel}:</p>
          
          <div class="details">
            <div class="detail-row"><span class="label">Service:</span> <span>${serviceName}</span></div>
            <div class="detail-row"><span class="label">Date:</span> <span>${appointmentDate}</span></div>
            <div class="detail-row"><span class="label">Time:</span> <span>${appointmentTime}</span></div>
            <div class="detail-row"><span class="label">Therapist:</span> <span>${practitionerName}</span></div>
          </div>
          
          <p><strong>Important:</strong> Please arrive 5-10 minutes early to complete any paperwork and prepare for your session.</p>
          
          <p>If you need to reschedule or cancel, please let us know at least 24 hours in advance.</p>
          
          <p>We look forward to seeing you!</p>
          
          <div class="footer">
            <p>${BRAND.name}<br>
            Thank you for choosing us for your wellness journey.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  let smsSent = false;
  let emailSent = false;

  // SMS — only if client consented on booking
  if (booking.consent_sms && booking.client_phone) {
    smsSent = await sendSMSWithRetry(booking.client_phone, smsMessage);
  }

  // Send email with retry
  if (booking.client_email) {
    const emailText = `Hi ${booking.client_name},\n\nThis is a friendly reminder about your upcoming appointment ${timeLabel}:\n\nService: ${serviceName}\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nTherapist: ${practitionerName}\n\nPlease arrive 5-10 minutes early.\n\nIf you need to reschedule or cancel, please let us know at least 24 hours in advance.\n\nWe look forward to seeing you!\n\n${BRAND.name}`;
    emailSent = await sendEmailWithRetry(booking.client_email, emailSubject, emailHtml, emailText);

    if (!emailSent) {
      const supabaseForLog = createClient(supabaseUrl, supabaseServiceKey);
      await supabaseForLog.from('audit_logs').insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        action: 'notification_failed',
        resource_type: 'booking',
        resource_id: booking.id,
        details: { function: 'send-reminders', type: `reminder_${reminderType}`, recipient: booking.client_email, channel: 'email', attempts: 3 },
      });
    }
  }

  // Record the reminder
  const sentVia = smsSent && emailSent ? 'both' : smsSent ? 'sms' : emailSent ? 'email' : 'none';
  const status = smsSent || emailSent ? 'sent' : 'failed';

  await supabase.from('appointment_reminders').insert({
    booking_id: booking.id,
    reminder_type: reminderType,
    sent_via: sentVia,
    status,
    error_message: status === 'failed' ? 'Failed to send via any channel after 3 attempts' : null,
  });

  console.log(`  Reminder recorded: ${reminderType} via ${sentVia} (${status})`);
}

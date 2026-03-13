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
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let _supabaseClient: any = null; // Set per-request for email logging

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

const EMAIL_FOOTER_HTML = BRAND.emailFooterHtml + `
    <p style="margin: 8px 0; text-align: center; color: #9ca3af; font-size: 12px;">You are receiving this email because you have an appointment or account with us.</p>`;

const EMAIL_FOOTER_TEXT = BRAND.emailFooterText + `\nYou are receiving this email because you have an appointment or account with us.`;

async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend not configured, skipping email');
    return false;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const htmlWithFooter = html.replace(/<\/body>/i, `${EMAIL_FOOTER_HTML}</body>`).includes(EMAIL_FOOTER_HTML)
      ? html.replace(/<\/body>/i, `${EMAIL_FOOTER_HTML}</body>`)
      : html + EMAIL_FOOTER_HTML;
    const textWithFooter = text ? text + EMAIL_FOOTER_TEXT : undefined;

    const { data: emailData, error } = await resend.emails.send({
      from: BRAND.fromSupport,
      to: [to],
      subject,
      html: htmlWithFooter,
      ...(textWithFooter && { text: textWithFooter }),
    });

    if (error) {
      console.error('Email failed:', error);
      if (_supabaseClient) {
        await _supabaseClient.from('sent_emails').insert({
          recipient_email: to, subject, body_html: htmlWithFooter,
          status: 'failed', error_message: JSON.stringify(error),
        }).then(() => {}, () => {});
      }
      return false;
    }
    
    console.log('Email sent successfully to:', to);
    if (_supabaseClient) {
      await _supabaseClient.from('sent_emails').insert({
        recipient_email: to, subject, body_html: htmlWithFooter,
        status: 'sent', resend_id: emailData?.id || null,
      }).then(() => {}, () => {});
    }
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
    _supabaseClient = supabase; // Enable email logging
    const { type, bookingId, recipientType, customMessage } = await req.json();

    console.log('[SEND-NOTIF] Processing notification:', { type, bookingId, recipientType });

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
      console.error('[SEND-NOTIF] Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Defensive: handle joins returning arrays instead of objects
    const practitioner = Array.isArray(booking.practitioners) ? booking.practitioners[0] : booking.practitioners;
    const practitioner2 = Array.isArray(booking.practitioner2) ? booking.practitioner2[0] : booking.practitioner2;
    const service = Array.isArray(booking.services) ? booking.services[0] : booking.services;
    const room = Array.isArray(booking.rooms) ? booking.rooms[0] : booking.rooms;

    console.log('[SEND-NOTIF] Booking loaded:', {
      bookingId,
      clientName: booking.client_name,
      practitionerEmail: practitioner?.email || 'NONE',
      practitionerName: practitioner?.name || 'NONE',
      serviceName: service?.name || 'NONE',
      status: booking.status,
    });

    // Parse date as local to avoid timezone shift
    const [yyyy, mm, dd] = booking.booking_date.split('-').map(Number);
    const formattedDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Build practitioner display string for client emails
    const practitionerNames: string[] = [];
    if (practitioner?.name) practitionerNames.push(practitioner.name);
    if (practitioner2?.name && practitioner2.id !== practitioner?.id) practitionerNames.push(practitioner2.name);
    const practitionerDisplay = practitionerNames.length > 0 ? practitionerNames.join(' & ') : 'N/A';

    const results: { sms: boolean[]; email: boolean[]; inApp: boolean[] } = {
      sms: [],
      email: [],
      inApp: []
    };

    // Track emails sent to avoid duplicates
    const emailsSentTo = new Set<string>();

    // Handle different notification types
    if (type === 'booking_reassigned' && (recipientType === 'staff' || !recipientType)) {
      // Notify the newly assigned practitioner(s) that they have been assigned to this booking
      const pract1 = Array.isArray(practitioner) ? practitioner[0] : practitioner;
      const pract2 = Array.isArray(practitioner2) ? practitioner2[0] : practitioner2;

      const reassignHtml = `
        <h2>Booking Assigned to You</h2>
        <p>A booking has been reassigned to you:</p>
        <ul>
          <li><strong>Client:</strong> ${booking.client_name}</li>
          <li><strong>Email:</strong> ${booking.client_email}</li>
          <li><strong>Phone:</strong> ${booking.client_phone || 'Not provided'}</li>
          <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
          <li><strong>Date:</strong> ${formattedDate}</li>
          <li><strong>Time:</strong> ${booking.start_time} - ${booking.end_time}</li>
          <li><strong>Room:</strong> ${room?.name || 'Not assigned'}</li>
          ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
        </ul>
        <p><a href="${BRAND.siteUrl}/calendar" style="display:inline-block;padding:12px 24px;background-color:#6b8f71;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">View Calendar</a></p>
      `;
      const reassignText = `Booking Assigned to You\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'Not provided'}\nService: ${service?.name || 'N/A'}\nDate: ${formattedDate}\nTime: ${booking.start_time} - ${booking.end_time}\nRoom: ${room?.name || 'Not assigned'}\n\nView calendar: ${BRAND.siteUrl}/calendar`;

      if (pract1) {
        if (pract1.email) {
          const sent = await sendEmailWithRetry(
            pract1.email,
            `Booking Assigned – ${booking.client_name} on ${formattedDate}`,
            reassignHtml,
            reassignText
          );
          results.email.push(sent);
          emailsSentTo.add(pract1.email.toLowerCase());
          if (!sent) {
            await supabase.from('audit_logs').insert({
              user_id: '00000000-0000-0000-0000-000000000000',
              action: 'notification_failed',
              resource_type: 'booking',
              resource_id: bookingId,
              details: { function: 'send-notification', type: 'booking_reassigned', recipient: pract1.email, channel: 'email', attempts: 3 },
            });
          }
        }
        if (pract1.user_id) {
          await supabase.from('notifications').insert({
            user_id: pract1.user_id,
            type: 'booking_reassigned',
            title: 'Booking Assigned to You',
            message: `${booking.client_name} – ${service?.name || 'Appointment'} on ${formattedDate} at ${booking.start_time}`,
            booking_id: bookingId,
            action_url: '/calendar',
          });
          results.inApp.push(true);
        }
      }

      if (pract2 && pract2.id !== pract1?.id) {
        if (pract2.email && !emailsSentTo.has(pract2.email.toLowerCase())) {
          await delay(1100);
          const sent = await sendEmailWithRetry(
            pract2.email,
            `Booking Assigned (Couples) – ${booking.client_name} on ${formattedDate}`,
            reassignHtml,
            reassignText
          );
          results.email.push(sent);
          if (pract2.user_id) {
            await supabase.from('notifications').insert({
              user_id: pract2.user_id,
              type: 'booking_reassigned',
              title: 'Couples Massage Assigned',
              message: `${booking.client_name} – ${service?.name || 'Appointment'} on ${formattedDate} at ${booking.start_time}`,
              booking_id: bookingId,
              action_url: '/calendar',
            });
          }
        }
      }

      console.log('[SEND-NOTIF] booking_reassigned sent to practitioner(s)');
    }

    if (type === 'approval_request' && practitioner) {
      const message = customMessage || 
        `New appointment request: ${booking.client_name} for ${service?.name || 'Service'} on ${formattedDate} at ${booking.start_time}. Please approve or decline.`;

      // SMS — only if practitioner consented
      if (practitioner.sms_consent && practitioner.phone) {
        results.sms.push(await sendSMS(practitioner.phone, message));
      }

      const approvalEmailHtml = `
          <h2>New Appointment Request</h2>
          <p>You have a new appointment that requires your approval:</p>
          <ul>
            <li><strong>Client:</strong> ${booking.client_name}</li>
            <li><strong>Email:</strong> ${booking.client_email}</li>
            <li><strong>Phone:</strong> ${booking.client_phone || 'Not provided'}</li>
            <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
            <li><strong>Date:</strong> ${formattedDate}</li>
            <li><strong>Time:</strong> ${booking.start_time} - ${booking.end_time}</li>
            <li><strong>Room:</strong> ${room?.name || 'Not assigned'}</li>
            ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
          </ul>
          <p>Please log in to approve or decline this appointment.</p>
        `;
      const approvalEmailText = `New Appointment Request

Client: ${booking.client_name}
Email: ${booking.client_email}
Phone: ${booking.client_phone || 'Not provided'}
Service: ${service?.name || 'N/A'}
Date: ${formattedDate}
Time: ${booking.start_time} - ${booking.end_time}
Room: ${room?.name || 'Not assigned'}${booking.notes ? '\nNotes: ' + booking.notes : ''}

Please log in to approve or decline this appointment.`;
      const approvalSubject = 'New Appointment Request - Approval Needed';

      if (practitioner.email) {
        const sent = await sendEmailWithRetry(practitioner.email, approvalSubject, approvalEmailHtml, approvalEmailText);
        results.email.push(sent);
        emailsSentTo.add(practitioner.email.toLowerCase());
        if (!sent) {
          await supabase.from('audit_logs').insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'notification_failed',
            resource_type: 'booking',
            resource_id: bookingId,
            details: { function: 'send-notification', type: 'approval_request', recipient: practitioner.email, channel: 'email', attempts: 3 },
          });
        }
      }

      // Also notify 2nd practitioner for couples massage
      if (practitioner2 && practitioner2.id !== practitioner?.id) {
        // SMS — only if 2nd practitioner consented
        if (practitioner2.sms_consent && practitioner2.phone) {
          const p2Message = `New couples massage request: ${booking.client_name} for ${service?.name || 'Service'} on ${formattedDate} at ${booking.start_time}. You are the 2nd practitioner. Please approve or decline.`;
          results.sms.push(await sendSMS(practitioner2.phone, p2Message));
        }

        if (practitioner2.email && !emailsSentTo.has(practitioner2.email.toLowerCase())) {
          await delay(1100);
          const sent = await sendEmailWithRetry(practitioner2.email, `${approvalSubject} (Couples)`, approvalEmailHtml, approvalEmailText);
          results.email.push(sent);
          emailsSentTo.add(practitioner2.email.toLowerCase());
          if (!sent) {
            await supabase.from('audit_logs').insert({
              user_id: '00000000-0000-0000-0000-000000000000',
              action: 'notification_failed',
              resource_type: 'booking',
              resource_id: bookingId,
              details: { function: 'send-notification', type: 'approval_request_p2', recipient: practitioner2.email, channel: 'email', attempts: 3 },
            });
          }
        }

        if (practitioner2.user_id) {
          await supabase.from('notifications').insert({
            user_id: practitioner2.user_id,
            type: 'approval_request',
            title: 'New Couples Massage Request',
            message: `${booking.client_name} has requested a ${service?.name || 'service'} on ${formattedDate} at ${booking.start_time} (you are the 2nd practitioner)`,
            booking_id: bookingId,
            action_url: `/dashboard?approve=${bookingId}`,
          });
        }
      }

      // Always CC support email
      if (!emailsSentTo.has(ADMIN_NOTIFICATION_EMAIL.toLowerCase())) {
        await delay(1100);
        const sent = await sendEmailWithRetry(ADMIN_NOTIFICATION_EMAIL, approvalSubject, approvalEmailHtml, approvalEmailText);
        results.email.push(sent);
        emailsSentTo.add(ADMIN_NOTIFICATION_EMAIL.toLowerCase());
      }

      if (practitioner.user_id) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: practitioner.user_id,
            type: 'approval_request',
            title: 'New Appointment Request',
            message: `${booking.client_name} has requested a ${service?.name || 'service'} on ${formattedDate} at ${booking.start_time}`,
            booking_id: bookingId,
            action_url: `/dashboard?approve=${bookingId}`
          });
        results.inApp.push(!notifError);
      }
    }

    // booking_approved is an alias for booking_confirmation (used by quick-action links)
    const isConfirmation = type === 'booking_confirmation' || type === 'booking_approved';
    if (isConfirmation || type === 'booking_declined') {
      const statusText = isConfirmation ? 'confirmed' : 'declined';
      const clientMessage = `Your appointment at ${BRAND.name} has been ${statusText}. ${
        isConfirmation
          ? `See you on ${formattedDate} at ${booking.start_time}!`
          : 'Please contact us to reschedule.'
      }`;

      if (recipientType === 'client' || recipientType === 'both') {
        // SMS — only if client consented
        if (booking.consent_sms && booking.client_phone) {
          results.sms.push(await sendSMS(booking.client_phone, clientMessage));
        }

        // Build "Add to Calendar" links for confirmation emails
        let addToCalendarHtml = '';
        let addToCalendarText = '';
        if (isConfirmation) {
          const serviceName = service?.name || 'Massage Appointment';
          const eventTitle = encodeURIComponent(serviceName + ' - ${BRAND.name}');
          const eventLocation = encodeURIComponent('${BRAND.name}, ${BRAND.address}');
          const eventDescription = encodeURIComponent(
            `${serviceName} with ${practitionerDisplay}\n\n${BRAND.name}\n${BRAND.address}\n${BRAND.supportEmail}`
          );

          const startDt = booking.booking_date.replace(/-/g, '') + 'T' + booking.start_time.replace(/:/g, '').substring(0, 4) + '00';
          const endDt = booking.booking_date.replace(/-/g, '') + 'T' + booking.end_time.replace(/:/g, '').substring(0, 4) + '00';

          const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${startDt}/${endDt}&ctz=Pacific/Honolulu&details=${eventDescription}&location=${eventLocation}`;
          const outlookStart = `${booking.booking_date}T${booking.start_time}`;
          const outlookEnd = `${booking.booking_date}T${booking.end_time}`;
          const outlookUrl = `https://outlook.live.com/calendar/0/action/compose?subject=${eventTitle}&startdt=${outlookStart}&enddt=${outlookEnd}&location=${eventLocation}&body=${eventDescription}`;
          const yahooUrl = `https://calendar.yahoo.com/?v=60&title=${eventTitle}&st=${startDt}&et=${endDt}&desc=${eventDescription}&in_loc=${eventLocation}`;

          const btnStyle = 'display:inline-block;padding:10px 18px;margin:4px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none;color:#ffffff;';

          addToCalendarHtml = `
            <div style="margin-top: 24px; padding: 20px; background-color: #f0fdf4; border-radius: 8px; text-align: center;">
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #166534;">📅 Add to Your Calendar</p>
              <div>
                <a href="${googleCalUrl}" target="_blank" style="${btnStyle}background-color:#4285f4;">Google Calendar</a>
                <a href="${outlookUrl}" target="_blank" style="${btnStyle}background-color:#0078d4;">Outlook</a>
                <a href="${yahooUrl}" target="_blank" style="${btnStyle}background-color:#720e9e;">Yahoo</a>
              </div>
            </div>
          `;

          addToCalendarText = `

📅 Add to Your Calendar:
Google Calendar: ${googleCalUrl}
Outlook: ${outlookUrl}`;
        }

        const origin = req.headers.get('origin') || BRAND.siteUrl;
        const checkInUrl = `${origin}/check-in?id=${bookingId}`;
        const checkInBtnStyle = 'display:inline-block;padding:14px 28px;margin-top:16px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none;color:#ffffff;background-color:#6b8f71;';

        const checkInHtml = isConfirmation ? `
          <div style="margin-top: 24px; padding: 20px; background-color: #f8fafc; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #1e293b;">📱 Check In on Appointment Day</p>
            <p style="margin: 0 0 12px; font-size: 13px; color: #64748b;">Please check in when you arrive. Your remaining balance will be automatically charged to your card on file after your appointment.</p>
            <a href="${checkInUrl}" target="_blank" style="${checkInBtnStyle}">Check In</a>
          </div>
          <div style="margin-top: 16px; padding: 16px; background-color: #fefce8; border-radius: 8px; border: 1px solid #fde68a;">
            <p style="margin: 0; font-size: 13px; color: #92400e;">💳 <strong>Payment Info:</strong> Your remaining balance will be automatically charged to the card on file shortly after your session ends. You'll receive a receipt and an option to add a gratuity.</p>
          </div>
        ` : '';

        const checkInText = isConfirmation
          ? `

📱 Check In on Appointment Day:
Please check in when you arrive: ${checkInUrl}

💳 Payment Info: Your remaining balance will be automatically charged to your card on file after your appointment. You'll receive a receipt and an option to add a gratuity.`
          : '';

        const isInsurance = booking.is_insurance_booking;
        const INSURANCE_DISCLAIMER = "Most insurance does not cover the full cost of the service. You will be required to cover the remainder of what your insurance does not cover at time of service.";

        const clientEmailHtml = isConfirmation ? (isInsurance ? `
          <h2>Appointment Confirmed!</h2>
          <p>Great news! Your insurance appointment has been confirmed.</p>
          <ul>
            <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
            <li><strong>Date:</strong> ${formattedDate}</li>
            <li><strong>Time:</strong> ${booking.start_time}</li>
            <li><strong>Practitioner:</strong> ${practitionerDisplay}</li>
          </ul>
          <p>Please bring your insurance card to your appointment.</p>
          <div style="margin: 16px 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #f59e0b;">
            <p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 500;">${INSURANCE_DISCLAIMER}</p>
          </div>
          ${addToCalendarHtml}
          <p>We look forward to seeing you!</p>
          <p>Best regards,<br>${BRAND.name}</p>
        ` : `
          <h2>Appointment Confirmed!</h2>
          <p>Great news! Your appointment has been confirmed.</p>
          <ul>
            <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
            <li><strong>Date:</strong> ${formattedDate}</li>
            <li><strong>Time:</strong> ${booking.start_time}</li>
            <li><strong>Practitioner:</strong> ${practitionerDisplay}</li>
          </ul>
          ${addToCalendarHtml}
          ${checkInHtml}
          <p>We look forward to seeing you!</p>
          <p>Best regards,<br>${BRAND.name}</p>
        `) : `
          <h2>Appointment Update</h2>
          <p>Unfortunately, your appointment request could not be confirmed at this time.</p>
          <ul>
            <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
            <li><strong>Requested Date:</strong> ${formattedDate}</li>
            <li><strong>Requested Time:</strong> ${booking.start_time}</li>
          </ul>
          <p>Please contact us to find an alternative time that works.</p>
          <p>Best regards,<br>${BRAND.name}</p>
        `;

        const clientEmailText = isConfirmation
          ? `Appointment Confirmed!

Service: ${service?.name || 'N/A'}
Date: ${formattedDate}
Time: ${booking.start_time}
Practitioner: ${practitionerDisplay}${isInsurance ? '\n\nPlease bring your insurance card to your appointment.\n\n' + INSURANCE_DISCLAIMER : ''}${addToCalendarText}${isInsurance ? '' : checkInText}

We look forward to seeing you!

Best regards,
${BRAND.name}`
          : `Appointment Update

Unfortunately, your appointment request could not be confirmed at this time.

Service: ${service?.name || 'N/A'}
Requested Date: ${formattedDate}
Requested Time: ${booking.start_time}

Please contact us to find an alternative time that works.

Best regards,
${BRAND.name}`;

        const clientEmailSent = await sendEmailWithRetry(
          booking.client_email,
          isConfirmation ? 'Your Appointment is Confirmed!' : 'Appointment Update',
          clientEmailHtml,
          clientEmailText
        );
        results.email.push(clientEmailSent);
        emailsSentTo.add(booking.client_email.toLowerCase());

        if (!clientEmailSent) {
          await supabase.from('audit_logs').insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'notification_failed',
            resource_type: 'booking',
            resource_id: bookingId,
            details: { function: 'send-notification', type, recipient: booking.client_email, channel: 'email', attempts: 3 },
          });
        }
      }

      // Notify assigned practitioners when booking is confirmed (only for staff/both recipients)
      if (isConfirmation && recipientType !== 'client') {
        const staffEmailHtml = `
          <h2>Appointment Confirmed</h2>
          <p>A new appointment has been confirmed on your schedule:</p>
          <ul>
            <li><strong>Client:</strong> ${booking.client_name}</li>
            <li><strong>Email:</strong> ${booking.client_email}</li>
            <li><strong>Phone:</strong> ${booking.client_phone || 'Not provided'}</li>
            <li><strong>Service:</strong> ${service?.name || 'N/A'}</li>
            <li><strong>Date:</strong> ${formattedDate}</li>
            <li><strong>Time:</strong> ${booking.start_time} - ${booking.end_time}</li>
            <li><strong>Room:</strong> ${room?.name || 'Not assigned'}</li>
            <li><strong>Practitioners:</strong> ${practitionerDisplay}</li>
            ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
          </ul>
          <p><a href="${BRAND.siteUrl}/calendar" style="display:inline-block;padding:12px 24px;background-color:#6b8f71;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">View Calendar</a></p>
        `;
        const staffEmailText = `Appointment Confirmed

Client: ${booking.client_name}
Email: ${booking.client_email}
Phone: ${booking.client_phone || 'Not provided'}
Service: ${service?.name || 'N/A'}
Date: ${formattedDate}
Time: ${booking.start_time} - ${booking.end_time}
Room: ${room?.name || 'Not assigned'}
Practitioners: ${practitionerDisplay}${booking.notes ? '\nNotes: ' + booking.notes : ''}

View your calendar: ${BRAND.siteUrl}/calendar`;

        // Notify primary practitioner
        console.log('[SEND-NOTIF] Staff email check:', { 
          hasPractitioner: !!practitioner, 
          practitionerEmail: practitioner?.email || 'N/A',
          practitionerType: typeof practitioner,
          isArray: Array.isArray(practitioner),
          emailsSentTo: Array.from(emailsSentTo),
        });
        
        // Handle case where PostgREST returns array instead of object
        const pract1 = Array.isArray(practitioner) ? practitioner[0] : practitioner;
        
        if (pract1) {
          if (pract1.email && !emailsSentTo.has(pract1.email.toLowerCase())) {
            await delay(1100);
            console.log('[SEND-NOTIF] Sending staff confirmation email to:', pract1.email);
            const sent = await sendEmailWithRetry(pract1.email, `Appointment Confirmed – ${booking.client_name} on ${formattedDate}`, staffEmailHtml, staffEmailText);
            results.email.push(sent);
            emailsSentTo.add(pract1.email.toLowerCase());
            console.log('[SEND-NOTIF] Staff email result:', { to: pract1.email, sent });
            if (!sent) {
              await supabase.from('audit_logs').insert({
                user_id: '00000000-0000-0000-0000-000000000000',
                action: 'notification_failed',
                resource_type: 'booking',
                resource_id: bookingId,
                details: { function: 'send-notification', type: 'confirmation_staff', recipient: pract1.email, channel: 'email', attempts: 3 },
              });
            }
          } else {
            console.log('[SEND-NOTIF] Skipped staff email:', { email: pract1?.email, alreadySent: pract1?.email ? emailsSentTo.has(pract1.email.toLowerCase()) : false });
          }

          if (pract1.user_id) {
            await supabase.from('notifications').insert({
              user_id: pract1.user_id,
              type: 'booking_confirmed',
              title: 'Appointment Confirmed',
              message: `${booking.client_name} – ${service?.name || 'Appointment'} on ${formattedDate} at ${booking.start_time}`,
              booking_id: bookingId,
              action_url: '/calendar',
            });
          }
        }

        // Notify 2nd practitioner (couples massage)
        const pract2 = Array.isArray(practitioner2) ? practitioner2[0] : practitioner2;
        if (pract2 && pract2.id !== pract1?.id) {
          if (pract2.email && !emailsSentTo.has(pract2.email.toLowerCase())) {
            await delay(1100);
            const sent = await sendEmailWithRetry(
              pract2.email,
              `Appointment Confirmed (Couples) – ${booking.client_name} on ${formattedDate}`,
              staffEmailHtml,
              staffEmailText
            );
            results.email.push(sent);
            emailsSentTo.add(pract2.email.toLowerCase());
            if (!sent) {
              await supabase.from('audit_logs').insert({
                user_id: '00000000-0000-0000-0000-000000000000',
                action: 'notification_failed',
                resource_type: 'booking',
                resource_id: bookingId,
                details: { function: 'send-notification', type: 'confirmation_staff_p2', recipient: pract2.email, channel: 'email', attempts: 3 },
              });
            }
          }

          if (pract2.user_id) {
            await supabase.from('notifications').insert({
              user_id: pract2.user_id,
              type: 'booking_confirmed',
              title: 'Couples Massage Confirmed',
              message: `${booking.client_name} – ${service?.name || 'Appointment'} on ${formattedDate} at ${booking.start_time} (you are the 2nd practitioner)`,
              booking_id: bookingId,
              action_url: '/calendar',
            });
          }
        }

        // CC admin
        if (!emailsSentTo.has(ADMIN_NOTIFICATION_EMAIL.toLowerCase())) {
          await delay(1100);
          const sent = await sendEmailWithRetry(ADMIN_NOTIFICATION_EMAIL, `Appointment Confirmed – ${booking.client_name} with ${practitionerDisplay} on ${formattedDate}`, staffEmailHtml, staffEmailText);
          results.email.push(sent);
          emailsSentTo.add(ADMIN_NOTIFICATION_EMAIL.toLowerCase());
        }
      }
    }

    console.log('Notification results:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        message: 'Notifications processed'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

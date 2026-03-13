import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { BRAND } from "../_shared/brand.ts";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SMS_ENABLED = false; // SMS disabled globally — email only
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const EMAIL_FOOTER_HTML = BRAND.emailFooterHtml + `
    <p style="margin: 8px 0; text-align: center; color: #9ca3af; font-size: 12px;">You are receiving this email because you have an appointment with us.</p>`;

const EMAIL_FOOTER_TEXT = BRAND.emailFooterText;

async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend not configured, skipping email');
    return false;
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const htmlWithFooter = html + EMAIL_FOOTER_HTML;
    const textWithFooter = text ? text + EMAIL_FOOTER_TEXT : undefined;

    const { error } = await resend.emails.send({
      from: BRAND.fromSupport,
      to: [to],
      subject,
      html: htmlWithFooter,
      ...(textWithFooter && { text: textWithFooter }),
    });

    if (error) {
      console.error('Email failed:', error);
      return false;
    }
    console.log('Follow-up email sent to:', to);
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

import { getCorsHeaders } from "../_shared/cors.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { logStructured } from "../_shared/logger.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[POST-APPT-PAYMENT] ${step}${detailsStr}`);
};

async function sendSMS(to: string, message: string): Promise<boolean> {
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

async function tryAutoCharge(
  stripe: Stripe,
  supabase: any,
  booking: any
): Promise<{ charged: boolean; paymentIntentId?: string }> {
  const stripeCustomerId = booking.stripe_payment_intent_id;
  if (!stripeCustomerId) {
    logStep('No Stripe customer ID on booking, skipping auto-charge');
    return { charged: false };
  }

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      logStep('No saved payment method, skipping auto-charge');
      return { charged: false };
    }

    const paymentMethodId = paymentMethods.data[0].id;
    logStep('Attempting auto-charge', { paymentMethodId, amount: booking.balance_due });

    const rawSvc = (booking.service as any);
    const svc = Array.isArray(rawSvc) ? rawSvc[0] : rawSvc;
    const serviceName = svc?.name || 'Massage Service';
    const rawPract = (booking.practitioner as any);
    const pract = Array.isArray(rawPract) ? rawPract[0] : rawPract;
    const practitionerName = pract?.name || 'your therapist';
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.balance_due * 100),
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `${serviceName} – ${practitionerName} – ${booking.booking_date}`,
      metadata: { bookingId: booking.id, type: 'balance_auto' },
    });

    if (paymentIntent.status === 'succeeded') {
      logStep('Auto-charge succeeded', { paymentIntentId: paymentIntent.id });

      await supabase
        .from('bookings')
        .update({ balance_paid: true })
        .eq('id', booking.id);

      return { charged: true, paymentIntentId: paymentIntent.id };
    }

    logStep('Auto-charge requires additional action', { status: paymentIntent.status });
    return { charged: false };
  } catch (error) {
    logStep('Auto-charge failed', { error: error instanceof Error ? error.message : String(error) });
    return { charged: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  const auth = requireInternalSecret(req, corsHeaders, { source: "post-appointment-payment" });
  if (!auth.ok) return auth.response;

  try {
    logStep("Function started - checking for appointments ending 10 minutes ago");
    logStructured("info", "post_appointment_started", "post-appointment-payment", {});

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const now = new Date();
    const hawaiiOffset = -10 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const hawaiiMinutes = ((utcMinutes + hawaiiOffset) % 1440 + 1440) % 1440;
    
    const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (utcMinutes + hawaiiOffset < 0) {
      utcDate.setUTCDate(utcDate.getUTCDate() - 1);
    }
    const today = utcDate.toISOString().split('T')[0];

    const tenMinAgoHI = hawaiiMinutes - 10;
    const elevenMinAgoHI = hawaiiMinutes - 11;

    const formatMin = (m: number) => {
      const wrapped = ((m % 1440) + 1440) % 1440;
      const h = Math.floor(wrapped / 60);
      const min = wrapped % 60;
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    };

    const timeWindowStart = formatMin(elevenMinAgoHI);
    const timeWindowEnd = formatMin(tenMinAgoHI);

    logStep("Time window (HST)", { timeWindowStart, timeWindowEnd, today });

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select(`
        id, client_name, client_email, client_phone, balance_due, balance_paid,
        booking_date, start_time, end_time, status, practitioner_id,
        stripe_payment_intent_id,
        service:services(name),
        practitioner:practitioners!bookings_practitioner_id_fkey(name)
      `)
      .eq('booking_date', today)
      .in('status', ['checked-in', 'confirmed'])
      .gte('end_time', timeWindowStart)
      .lte('end_time', timeWindowEnd);

    if (error) {
      logStep("Query error", { error: error.message });
      throw error;
    }

    logStep("Found bookings", { count: bookings?.length || 0 });

    const results: { bookingId: string; autoCharged: boolean; smsSent: boolean; emailSent: boolean }[] = [];

    for (const booking of bookings || []) {
      // Defensive array unwrapping for PostgREST joins
      const rawService = (booking as any).service;
      const service = Array.isArray(rawService) ? rawService[0] : rawService;
      const rawPractitioner = (booking as any).practitioner;
      const practitioner = Array.isArray(rawPractitioner) ? rawPractitioner[0] : rawPractitioner;

      const hasBalanceDue = booking.balance_due && booking.balance_due > 0 && !booking.balance_paid;
      const serviceName = service?.name || 'session';
      const practitionerName = practitioner?.name || 'your therapist';
      const firstName = booking.client_name.split(' ')[0];

      let autoCharged = false;

      if (hasBalanceDue) {
        // Guard: check if a paid balance payment already exists to prevent duplicate charges
        const { data: existingPaid } = await supabase
          .from('booking_payments')
          .select('id')
          .eq('booking_id', booking.id)
          .eq('type', 'balance')
          .eq('status', 'paid')
          .limit(1);

        if (existingPaid && existingPaid.length > 0) {
          logStep("Balance already paid in booking_payments, skipping auto-charge", { bookingId: booking.id });
        } else {
          const chargeResult = await tryAutoCharge(stripe, supabase, booking);
          autoCharged = chargeResult.charged;
        }
      }

      const paymentUrl = `${BRAND.siteUrl}/pay-balance?booking=${booking.id}`;
      const tipUrl = `${BRAND.siteUrl}/tip?booking=${booking.id}`;

      // SMS disabled
      let smsSent = false;
      if (SMS_ENABLED && booking.client_phone) {
        let message: string;
        if (autoCharged) {
          message = `Hi ${firstName}! Thank you for your ${serviceName} with ${practitionerName} at ${BRAND.name}. Your remaining balance of $${booking.balance_due.toFixed(2)} has been charged to your card on file. You can leave a tip for your therapist here: ${tipUrl}`;
        } else if (hasBalanceDue) {
          message = `Hi ${firstName}! Thank you for your ${serviceName} with ${practitionerName} at ${BRAND.name}. Your remaining balance of $${booking.balance_due.toFixed(2)} is ready. You can also leave a tip for your therapist! Complete your payment here: ${paymentUrl}`;
        } else {
          message = `Hi ${firstName}! Thank you for your ${serviceName} with ${practitionerName} at ${BRAND.name}. You can leave a tip for your therapist here: ${tipUrl}`;
        }

        smsSent = await sendSMSWithRetry(booking.client_phone, message);

        if (smsSent) {
          await supabase.from('sms_messages').insert({
            customer_phone: booking.client_phone,
            customer_name: booking.client_name,
            direction: 'outbound',
            content: message,
            status: 'sent',
            booking_id: booking.id,
          });
        }
      }

      // Send follow-up email with retry
      let emailSent = false;
      if (booking.client_email) {
        const btnStyle = 'display:inline-block;padding:14px 28px;margin:8px 4px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none;color:#ffffff;';

        const formattedDate = new Date(booking.booking_date + 'T12:00:00').toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        let paymentSection = '';
        if (autoCharged) {
          paymentSection = `
            <div style="margin: 24px 0; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
              <p style="margin: 0 0 4px; font-size: 14px; color: #166534;">✅ Payment Processed</p>
              <p style="margin: 0; font-size: 16px; color: #1e293b;">$${booking.balance_due.toFixed(2)} has been charged to your card on file.</p>
            </div>
          `;
        } else if (hasBalanceDue) {
          paymentSection = `
            <div style="margin: 24px 0; padding: 20px; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
              <p style="margin: 0 0 4px; font-size: 14px; color: #64748b;">Remaining Balance</p>
              <p style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b;">$${booking.balance_due.toFixed(2)}</p>
            </div>
            <div style="text-align: center;">
              <a href="${paymentUrl}" target="_blank" style="${btnStyle}background-color:#6b8f71;">Pay Balance</a>
            </div>
          `;
        }

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">Thank you for visiting us, ${firstName}!</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              We hope you enjoyed your <strong>${serviceName}</strong> with <strong>${practitionerName}</strong> on ${formattedDate}.
            </p>

            ${paymentSection}

            <div style="margin-top: 32px; padding: 20px; background-color: #fff7ed; border-radius: 8px; border: 1px solid #fed7aa; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #9a3412;">💛 Leave a Tip for ${practitionerName}</p>
              <p style="margin: 0 0 12px; font-size: 13px; color: #c2410c;">Your generosity is truly appreciated! 100% goes directly to your therapist.</p>
              <a href="${tipUrl}" target="_blank" style="${btnStyle}background-color:#c2834a;">Leave a Tip</a>
            </div>

            <p style="margin-top: 24px; color: #475569; font-size: 14px; line-height: 1.6;">
              Thank you for choosing ${BRAND.name}. We look forward to seeing you again!
            </p>
            <p style="color: #475569; font-size: 14px;">
              Best regards,<br>${BRAND.name}
            </p>
          </div>
        `;

        const emailText = `Thank you for visiting us, ${firstName}!\n\nWe hope you enjoyed your ${serviceName} with ${practitionerName} on ${formattedDate}.\n\n${autoCharged ? `Payment of $${booking.balance_due.toFixed(2)} has been charged to your card on file.` : hasBalanceDue ? `Remaining Balance: $${booking.balance_due.toFixed(2)}\nPay here: ${paymentUrl}` : ''}\n\nLeave a tip for ${practitionerName}: ${tipUrl}\n\nThank you for choosing ${BRAND.name}!\n\nBest regards,\n${BRAND.name}`;

        emailSent = await sendEmailWithRetry(
          booking.client_email,
          autoCharged
            ? `Thank you for your visit! – Receipt & leave a tip`
            : `Thank you for your visit! – Complete your payment & leave a tip`,
          emailHtml,
          emailText
        );

        if (!emailSent) {
          await supabase.from('audit_logs').insert({
            user_id: '00000000-0000-0000-0000-000000000000',
            action: 'notification_failed',
            resource_type: 'booking',
            resource_id: booking.id,
            details: { function: 'post-appointment-payment', type: 'follow_up_email', recipient: booking.client_email, channel: 'email', attempts: 3 },
          });
        }
      }

      // Log payment records
      if (autoCharged && hasBalanceDue) {
        await supabase.from('booking_payments').insert({
          booking_id: booking.id,
          type: 'auto_charge',
          amount: booking.balance_due,
          status: 'paid',
          paid_at: new Date().toISOString(),
          sent_to_email: booking.client_email,
          sent_to_phone: booking.client_phone,
        });
      } else if (hasBalanceDue && !autoCharged) {
        await supabase.from('booking_payments').insert({
          booking_id: booking.id,
          type: 'balance',
          amount: booking.balance_due,
          status: 'pending',
          stripe_checkout_url: paymentUrl,
          sent_to_email: booking.client_email,
          sent_to_phone: booking.client_phone,
        });
      }

      // Log tip link sent
      await supabase.from('booking_payments').insert({
        booking_id: booking.id,
        type: 'tip',
        amount: 0,
        status: 'pending',
        stripe_checkout_url: tipUrl,
        sent_to_email: booking.client_email,
        sent_to_phone: booking.client_phone,
      });

      // Mark booking as completed
      await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', booking.id);

      results.push({ bookingId: booking.id, autoCharged, smsSent, emailSent });
      logStep("Processed booking", { bookingId: booking.id, autoCharged, smsSent, emailSent });
    }

    logStructured("info", "post_appointment_complete", "post-appointment-payment", {
      processed: results.length,
      bookingIds: results.map((r) => r.bookingId),
    });

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    logStructured("error", "post_appointment_failed", "post-appointment-payment", { error: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

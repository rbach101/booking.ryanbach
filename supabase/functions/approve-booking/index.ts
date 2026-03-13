import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { Resend } from "https://esm.sh/resend@6.9.3";

import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";
import { expirePendingDepositsForBooking } from "../_shared/booking-payments.ts";
import { BRAND } from "../_shared/brand.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ApprovalRequest {
  bookingId: string;
  action: 'approve' | 'decline';
  reason?: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[APPROVE-BOOKING] ${step}${detailsStr}`);
};

async function chargeWithRetry(
  stripe: Stripe,
  params: Stripe.PaymentIntentCreateParams,
  maxAttempts = 3
): Promise<Stripe.PaymentIntent> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const pi = await stripe.paymentIntents.create(params);
      return pi;
    } catch (error: any) {
      if (['card_declined', 'expired_card', 'insufficient_funds', 'authentication_required'].includes(error.code)) {
        throw error;
      }
      logStep(`Charge attempt ${attempt}/${maxAttempts} failed`, { error: error.message });
      if (attempt === maxAttempts) throw error;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Retry exhausted');
}

// Find any usable payment method on a Stripe customer
async function findPaymentMethod(stripe: Stripe, customerId: string): Promise<string | null> {
  // 1. Check listed payment methods
  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 5,
  });

  if (paymentMethods.data.length > 0) {
    logStep("Found listed payment method", { id: paymentMethods.data[0].id });
    return paymentMethods.data[0].id;
  }

  // 2. Check customer default
  const customer = await stripe.customers.retrieve(customerId);
  if (customer && !customer.deleted && customer.invoice_settings?.default_payment_method) {
    const defaultPm = customer.invoice_settings.default_payment_method as string;
    logStep("Found default payment method", { id: defaultPm });
    return defaultPm;
  }

  // 3. Check completed SetupIntents — this is what create-deposit-payment uses
  const setupIntents = await stripe.setupIntents.list({
    customer: customerId,
    limit: 5,
  });

  for (const si of setupIntents.data) {
    if (si.status === 'succeeded' && si.payment_method) {
      const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method.id;
      logStep("Found payment method from SetupIntent", { setupIntentId: si.id, paymentMethodId: pmId });
      
      // Attach to customer if not already
      try {
        await stripe.paymentMethods.attach(pmId, { customer: customerId });
      } catch (e: any) {
        if (!e.message?.includes('already been attached')) {
          logStep("Attach warning (non-blocking)", { error: e.message });
        }
      }

      // Set as default for future
      try {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: pmId },
        });
      } catch (e: any) {
        logStep("Set default warning (non-blocking)", { error: e.message });
      }

      return pmId;
    }
  }

  logStep("No payment method found on customer");
  return null;
}

const INSURANCE_DISCLAIMER = "Most insurance does not cover the full cost of the service. You will be required to cover the remainder of what your insurance does not cover at time of service.";

// Send deposit payment link email directly via Resend
async function sendDepositEmail(
  clientEmail: string,
  clientName: string,
  depositAmount: number,
  serviceName: string,
  bookingDate: string,
  startTime: string,
  checkoutUrl: string,
  isInsurance?: boolean
): Promise<boolean> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey || !checkoutUrl) {
    logStep("Cannot send deposit email — missing Resend key or checkout URL");
    return false;
  }

  try {
    const resend = new Resend(resendApiKey);
    const displayName = clientName || "Valued Guest";
    const displayService = serviceName || "your appointment";
    const formattedAmount = `$${depositAmount.toFixed(2)}`;

    // Parse date for display
    let displayDate = bookingDate;
    try {
      const [yyyy, mm, dd] = bookingDate.split('-').map(Number);
      displayDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch { /* use raw date */ }

    // Format time for display
    let displayTime = startTime;
    try {
      const [h, m] = startTime.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      displayTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
    } catch { /* use raw time */ }

    const htmlBody = `
      <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6b8f71; font-size: 24px; margin: 0;">${BRAND.name}</h1>
        </div>
        <h2 style="color: #333; font-size: 20px;">Deposit Payment Request</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi ${displayName},</p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Great news — your appointment has been approved! To confirm your booking on <strong>${displayDate}</strong> at <strong>${displayTime}</strong> for <strong>${displayService}</strong>, please complete your <strong>${formattedAmount}</strong> deposit.
        </p>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          Your remaining balance will be automatically charged to your card on file after your appointment. You'll receive a receipt and an option to leave a gratuity.
        </p>
        ${isInsurance ? `<div style="margin: 16px 0; padding: 16px; background-color: #fef3c7; border-radius: 8px; border: 1px solid #f59e0b;"><p style="margin: 0; font-size: 14px; color: #92400e; font-weight: 500;">${INSURANCE_DISCLAIMER}</p></div>` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${checkoutUrl}" style="display:inline-block;padding:16px 36px;background-color:#6b8f71;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:17px;">Pay ${formattedAmount} Deposit</a>
        </div>
        <p style="color: #888; font-size: 14px; line-height: 1.5;">
          If you have any questions, please reply to this email or contact us at ${BRAND.supportEmail}.
        </p>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">Thanks,<br/>${BRAND.name}</p>
        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
          <p style="margin: 4px 0;">${BRAND.name}</p>
          <p style="margin: 4px 0;">${BRAND.address}</p>
          <p style="margin: 4px 0;">${BRAND.supportEmail}</p>
        </div>
      </div>
    `;

    const textBody = `Hi ${displayName},\n\nGreat news — your appointment has been approved! To confirm your booking on ${displayDate} at ${displayTime} for ${displayService}, please complete your ${formattedAmount} deposit.\n\nPay here: ${checkoutUrl}\n\nYour remaining balance will be automatically charged to your card on file after your appointment.\n\nThanks,\n${BRAND.name}\n${BRAND.address}`;

    await resend.emails.send({
      from: BRAND.fromSupport,
      to: [clientEmail],
      cc: [BRAND.supportEmail],
      subject: `Deposit Payment – ${formattedAmount} for ${displayService}`,
      html: htmlBody,
      text: textBody,
    });

    logStep("Deposit email sent successfully", { to: clientEmail });
    return true;
  } catch (emailError) {
    logStep("Deposit email failed (non-blocking)", { error: String(emailError) });
    return false;
  }
}

function buildConfirmationEmailWithIntake(
  clientName: string, service: string, date: string, time: string, intakeSection: string, insuranceDisclaimer?: string
): string {
  const disclaimerSection = insuranceDisclaimer ? `
<tr><td style="padding: 0 32px 16px;">
  <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 16px;">
    <p style="color: #92400E; font-size: 14px; margin: 0; font-weight: 500;">${insuranceDisclaimer}</p>
  </div>
</td></tr>` : '';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#667B68 0%,#4a5a4b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
<h1 style="color:white;margin:0;font-size:24px;">Booking Confirmed! ✨</h1>
</td></tr>
<tr><td style="padding:32px;">
<p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${clientName},</p>
<p style="color:#374151;font-size:16px;margin:0 0 24px;">Great news — your appointment has been confirmed!</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;"><tr><td>
<table width="100%" cellpadding="8" cellspacing="0">
<tr><td style="color:#6b7280;font-size:14px;width:120px;">Service:</td><td style="color:#111827;font-size:14px;font-weight:600;">${service}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Date:</td><td style="color:#111827;font-size:14px;font-weight:600;">${date}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Time:</td><td style="color:#111827;font-size:14px;font-weight:600;">${time}</td></tr>
</table></td></tr></table>
</td></tr>
${disclaimerSection}
${intakeSection}
<tr><td style="padding:0 32px 24px;">
<p style="color:#6b7280;font-size:14px;margin:0;">If you have any questions, please contact us at <a href="mailto:${BRAND.supportEmail}" style="color:#667B68;">${BRAND.supportEmail}</a>.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;">
<p style="color:#667B68;font-size:14px;margin:0;font-weight:600;">${BRAND.name}</p>
<p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">${BRAND.address}</p>
</td></tr>
</table></td></tr></table></body></html>`;
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

    // Check user role
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

    const { bookingId, action, reason }: ApprovalRequest = await req.json();
    logStep("Request received", { bookingId, action });

    if (!bookingId || !action) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bookingId, action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only admins can decline/cancel bookings
    if (action === 'decline' && !userRoles.includes('admin')) {
      return new Response(
        JSON.stringify({ error: 'Only admins can cancel appointments' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the booking with service info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, practitioners:practitioner_id (user_id), practitioner2:practitioner_2_id (user_id), services:service_id (name, deposit_required, price, category)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Defensive: handle joins returning arrays instead of objects
    const practitioners = Array.isArray(booking.practitioners) ? booking.practitioners[0] : booking.practitioners;
    const practitioner2 = Array.isArray(booking.practitioner2) ? booking.practitioner2[0] : booking.practitioner2;
    const services = Array.isArray(booking.services) ? booking.services[0] : booking.services;
    // Re-assign for downstream usage
    booking.practitioners = practitioners;
    booking.practitioner2 = practitioner2;
    booking.services = services;

    // Treat as insurance if booking flag is set OR service category is insurance (fallback for legacy bookings)
    const isInsuranceBooking = !!booking.is_insurance_booking || services?.category === 'insurance';
    if (isInsuranceBooking && !booking.is_insurance_booking) {
      logStep("Derived insurance from service category", { serviceCategory: services?.category });
    }

    logStep("Booking found", { 
      clientEmail: booking.client_email, 
      depositRequired: services?.deposit_required,
      servicePrice: services?.price,
      stripeCustomerId: booking.stripe_payment_intent_id,
      isInsuranceBooking,
    });

    // For staff, verify they are the assigned practitioner
    if (!userRoles.includes('admin')) {
      const isAssigned = practitioners?.user_id === user.id || practitioner2?.user_id === user.id;
      if (!isAssigned) {
        return new Response(
          JSON.stringify({ error: 'You can only approve/decline your own appointments' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // --- DEPOSIT HANDLING ON APPROVAL ---
    let depositCharged = false;
    let depositError: string | null = null;
    let paymentLinkSent = false;
    let paymentLinkUrl: string | null = null;
    let depositEmailSent = false;

    if (action === 'approve') {
      // --- COUPLES MASSAGE DUAL-APPROVAL CHECK ---
      const isCouplesBooking = !!booking.practitioner_2_id;
      
      if (isCouplesBooking) {
        // Determine which practitioner slot this user fills
        const isAdmin = userRoles.includes('admin');
        const isPract1 = booking.practitioners?.user_id === user.id;
        const isPract2 = booking.practitioner2?.user_id === user.id;
        
        // Get practitioner names for response
        const { data: pract1Data } = await supabase.from('practitioners').select('name').eq('id', booking.practitioner_id).single();
        const { data: pract2Data } = await supabase.from('practitioners').select('name').eq('id', booking.practitioner_2_id).single();
        
        // Record partial approval
        const approvalUpdate: Record<string, any> = {};
        if (isPract1 || (isAdmin && !booking.approved_by_practitioner_1)) {
          approvalUpdate.approved_by_practitioner_1 = user.id;
        } else if (isPract2 || (isAdmin && !booking.approved_by_practitioner_2)) {
          approvalUpdate.approved_by_practitioner_2 = user.id;
        }
        
        // Check current state + this approval
        const alreadyApproved1 = booking.approved_by_practitioner_1 || approvalUpdate.approved_by_practitioner_1;
        const alreadyApproved2 = booking.approved_by_practitioner_2 || approvalUpdate.approved_by_practitioner_2;
        
        if (!alreadyApproved1 || !alreadyApproved2) {
          // PARTIAL APPROVAL — save and notify remaining practitioner
          await supabase
            .from('bookings')
            .update(approvalUpdate)
            .eq('id', bookingId);
          await debugLog(supabase, "approve-booking:bookings.update", "Partial approval (couples)", { booking_id: bookingId });
          
          logStep("Partial approval recorded for couples booking", { approvalUpdate, bookingId });
          
          // Notify the other practitioner
          const awaitingName = !alreadyApproved1 ? (pract1Data?.name || 'Practitioner 1') : (pract2Data?.name || 'Practitioner 2');
          const approverName = isPract1 ? (pract1Data?.name || 'Practitioner 1') : (pract2Data?.name || 'Practitioner 2');
          
          // Send partial approval notification to the other practitioner
          const otherPractitioner = !alreadyApproved1 ? booking.practitioners : booking.practitioner2;
          if (otherPractitioner?.user_id) {
            await supabase.from('notifications').insert({
              user_id: otherPractitioner.user_id,
              type: 'approval_needed',
              title: 'Co-Therapist Approved — Your Turn',
              message: `${approverName} has approved ${booking.client_name}'s couples massage. Your confirmation is needed to finalize the booking.`,
              booking_id: bookingId,
              action_url: `/dashboard?approve=${bookingId}`,
            });
          }
          
          // Send email to remaining practitioner
          if (otherPractitioner?.email) {
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/notify-staff-booking`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ bookingId, partialApproval: true, approverName }),
              });
            } catch (e) {
              logStep("Partial approval notification attempted", { error: String(e) });
            }
          }
          
          return new Response(
            JSON.stringify({
              success: true,
              partialApproval: true,
              message: `Your approval has been recorded. Waiting for ${awaitingName} to also approve.`,
              awaitingPractitioner: awaitingName,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Both approved — merge the approval columns into the update and proceed to full confirmation
        logStep("Both practitioners approved couples booking, proceeding to confirm", { bookingId });
        // The approvalUpdate will be merged into the final update below
        // Store it for later
        (globalThis as any).__couplesApprovalUpdate = approvalUpdate;
      }
      // --- END COUPLES DUAL-APPROVAL ---

      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

      if (!stripeSecretKey) {
        logStep("Stripe secret key not configured");
        depositError = "Payment processing not configured";
      } else {
        const stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-08-27.basil" });

        // Calculate deposit: use service deposit_required, or 50% of price as fallback
        const servicePrice = booking.services?.price || booking.total_amount || 0;
        const depositAmount = booking.services?.deposit_required || Math.round(servicePrice * 0.5 * 100) / 100;

        if (depositAmount <= 0 || isInsuranceBooking || booking.balance_due === 0 || booking.deposit_paid) {
          logStep("No deposit required (insurance or zero amount)");
        } else {
          const stripeCustomerId = booking.stripe_payment_intent_id; // Stripe customer ID stored here

          if (stripeCustomerId) {
            // PATH A: Customer exists — try to find a saved card and charge it
            logStep("Looking for payment method", { depositAmount, customerId: stripeCustomerId });

            try {
              const paymentMethodId = await findPaymentMethod(stripe, stripeCustomerId);

              if (paymentMethodId) {
                logStep("Attempting direct charge", { depositAmount, paymentMethodId });

                const paymentIntent = await chargeWithRetry(stripe, {
                  amount: Math.round(depositAmount * 100),
                  currency: 'usd',
                  customer: stripeCustomerId,
                  payment_method: paymentMethodId,
                  off_session: true,
                  confirm: true,
                  description: `Deposit for ${booking.services?.name || 'Appointment'} - ${booking.client_name}`,
                  metadata: {
                    bookingId,
                    type: 'deposit',
                    clientEmail: booking.client_email,
                  },
                });

                if (paymentIntent.status === 'succeeded') {
                  depositCharged = true;
                  logStep("Deposit charged successfully", { paymentIntentId: paymentIntent.id });

                  // Record in booking_payments
                  await supabase.from('booking_payments').insert({
                    booking_id: bookingId,
                    amount: depositAmount,
                    type: 'deposit',
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    stripe_payment_intent_id: paymentIntent.id,
                    sent_to_email: booking.client_email,
                  });
                  await debugLog(supabase, "approve-booking:booking_payments.insert", "Deposit paid (direct charge)", { booking_id: bookingId, amount: depositAmount });
                } else {
                  logStep("Direct charge status not succeeded, falling back", { status: paymentIntent.status });
                }
              }
            } catch (stripeError: any) {
              logStep("Direct charge failed, falling back to payment link", { error: stripeError.message, code: stripeError.code });
            }
          }

          // PATH B: No card on file OR direct charge failed — send payment link
          if (!depositCharged) {
            logStep("Creating deposit payment link", { depositAmount, clientEmail: booking.client_email });

            try {
              // Find or create Stripe customer
              let customerId = stripeCustomerId;
              if (!customerId) {
                const customers = await stripe.customers.list({ email: booking.client_email, limit: 1 });
                if (customers.data.length > 0) {
                  customerId = customers.data[0].id;
                } else {
                  const newCustomer = await stripe.customers.create({
                    email: booking.client_email,
                    name: booking.client_name || "Guest",
                    metadata: { source: "approve_booking_deposit", bookingId },
                  });
                  customerId = newCustomer.id;
                }
                logStep("Stripe customer for link", { customerId });
              }

              const origin = req.headers.get("origin") || BRAND.siteUrl;
              const balanceDue = servicePrice - depositAmount;

              // Create ONE checkout session — this is the single source of truth
              const session = await stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ["card"],
                line_items: [
                  {
                    price_data: {
                      currency: "usd",
                      product_data: {
                        name: `Deposit – ${booking.services?.name || 'Appointment'}`,
                        description: `${booking.booking_date} at ${booking.start_time}`,
                      },
                      unit_amount: Math.round(depositAmount * 100),
                    },
                    quantity: 1,
                  },
                ],
                mode: "payment",
                payment_intent_data: {
                  setup_future_usage: "off_session",
                },
                success_url: `${origin}/booking-confirmed?booking=${bookingId}`,
                cancel_url: `${origin}/pay-balance?booking=${bookingId}`,
                metadata: { bookingId, type: "deposit_payment_link" },
              });

              paymentLinkUrl = session.url;
              paymentLinkSent = true;

              // Update booking with customer ID and balance info
              await supabase
                .from("bookings")
                .update({
                  stripe_payment_intent_id: customerId,
                  total_amount: servicePrice,
                  balance_due: balanceDue,
                })
                .eq("id", bookingId);

              // Expire any existing pending deposits before creating new one (prevents duplicates)
              await expirePendingDepositsForBooking(supabase, bookingId);
              // Record in booking_payments — single record for this deposit
              await supabase.from('booking_payments').insert({
                booking_id: bookingId,
                amount: depositAmount,
                type: 'deposit',
                status: 'pending',
                stripe_session_id: session.id,
                stripe_checkout_url: session.url,
                sent_to_email: booking.client_email,
                sent_at: new Date().toISOString(),
              });
              await debugLog(supabase, "approve-booking:booking_payments.insert", "Deposit payment link created", { booking_id: bookingId, amount: depositAmount });

              logStep("Payment link created", { sessionId: session.id, url: session.url });

              // Send deposit email with retry — NO separate function call to avoid duplicate sessions
              for (let emailAttempt = 1; emailAttempt <= 3 && !depositEmailSent; emailAttempt++) {
                logStep(`Deposit email attempt ${emailAttempt}/3`);
                depositEmailSent = await sendDepositEmail(
                  booking.client_email,
                  booking.client_name,
                  depositAmount,
                  booking.services?.name || 'Appointment',
                  booking.booking_date,
                  booking.start_time,
                  session.url!,
                  isInsuranceBooking,
                );
                if (!depositEmailSent && emailAttempt < 3) {
                  await new Promise(r => setTimeout(r, 2000 * Math.pow(2, emailAttempt - 1)));
                }
              }

              if (!depositEmailSent) {
                logStep("CRITICAL: All deposit email attempts failed", { bookingId, clientEmail: booking.client_email });
                try {
                  await supabase.from('audit_logs').insert({
                    user_id: user.id,
                    user_email: user.email || null,
                    action: 'notification_failed',
                    resource_type: 'booking',
                    resource_id: bookingId,
                    details: { function: 'approve-booking', target: 'deposit_email', attempts: 3, channel: 'email', recipient: booking.client_email },
                  });
                } catch (auditErr) {
                  logStep("Audit log insert failed", { error: String(auditErr) });
                }
              }

            } catch (linkError: any) {
              depositError = `Failed to create payment link: ${linkError.message}`;
              logStep("Payment link creation failed", { error: linkError.message });
            }
          }
        }
      }
    }

    // Update booking status — use atomic status precondition
    const newStatus = action === 'approve' ? 'confirmed' : 'cancelled';
    const updateData: any = { 
      status: newStatus,
      notes: reason ? `${booking.notes || ''}\n[${action.toUpperCase()}] ${reason}`.trim() : booking.notes
    };

    // Merge couples approval columns if applicable
    const couplesApprovalUpdate = (globalThis as any).__couplesApprovalUpdate;
    if (couplesApprovalUpdate) {
      Object.assign(updateData, couplesApprovalUpdate);
      delete (globalThis as any).__couplesApprovalUpdate;
    }

    // Mark deposit as paid if successfully charged
    if (depositCharged) {
      updateData.deposit_paid = true;
    }

    const allowedPreviousStatuses = action === 'approve' 
      ? ['pending', 'pending_approval'] 
      : ['pending', 'pending_approval', 'confirmed'];

    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .in('status', allowedPreviousStatuses)
      .select('id')
      .maybeSingle();

    if (updatedBooking) {
      await debugLog(supabase, "approve-booking:bookings.update", "Booking status updated", { booking_id: bookingId, status: newStatus });
    }

    if (!updatedBooking) {
      logStep("Booking already processed or in invalid state", { currentStatus: booking.status });
      return new Response(
        JSON.stringify({ error: `Booking has already been ${booking.status}. No changes made.` }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (updateError) {
      console.error('Update error:', updateError);
      if ((updateError as any).code === '23505' || (updateError as any).message?.includes('already booked')) {
        return new Response(
          JSON.stringify({ error: 'This time slot is no longer available. Another booking was just confirmed for this time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to update booking' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep(`Booking ${bookingId} ${action}d by user ${user.id}`, { depositCharged, paymentLinkSent, depositEmailSent });

    // ========== CALENDAR SYNC — run FIRST before emails/notifications ==========
    // This is critical and must not be delayed by Stripe/email/notification work
    if (action === 'approve') {
      try {
        const { data: connections } = await supabase
          .from('calendar_connections')
          .select('id')
          .eq('is_connected', true)
          .limit(1);

        if (connections && connections.length > 0) {
          const syncResponse = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'create-event',
              bookingId,
            }),
          });
          
          if (!syncResponse.ok) {
            const syncError = await syncResponse.text();
            logStep("Calendar sync failed (non-blocking)", { error: syncError });
          } else {
            logStep("Calendar sync successful");
          }
        }
      } catch (syncError) {
        console.error('Calendar sync error (non-blocking):', syncError);
      }
    }

    // Delete Google Calendar event when declining
    if (action === 'decline') {
      try {
        const syncResponse = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'delete-event',
            bookingId,
          }),
        });
        if (!syncResponse.ok) {
          const syncError = await syncResponse.text();
          logStep("Calendar delete failed (non-blocking)", { error: syncError });
        } else {
          logStep("Calendar event deleted");
        }
      } catch (syncError) {
        console.error('Calendar delete error (non-blocking):', syncError);
      }
    }

    // Send client confirmation email with intake form link (only on approval, only if not already submitted)
    if (action === 'approve') {
      try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          // Check if client has already submitted an intake form
          const { data: existingResponse } = await supabase
            .from('intake_form_responses')
            .select('id')
            .eq('client_email', booking.client_email.toLowerCase())
            .limit(1);

          const hasCompletedIntake = existingResponse && existingResponse.length > 0;
          logStep(`Intake form check for ${booking.client_email}`, { hasCompletedIntake });

          let intakeFormUrl = '';
          if (!hasCompletedIntake) {
            const { data: activeTemplate } = await supabase
              .from('intake_form_templates')
              .select('id')
              .eq('is_active', true)
              .eq('is_required', true)
              .limit(1)
              .maybeSingle();

            if (activeTemplate) {
              intakeFormUrl = `${BRAND.siteUrl}/check-in?bookingId=${bookingId}&form=${activeTemplate.id}`;
            }
          }

          // Format date/time for email
          let displayDate = booking.booking_date;
          try {
            const [yyyy, mm, dd] = booking.booking_date.split('-').map(Number);
            displayDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            });
          } catch { /* use raw */ }

          let displayTime = booking.start_time;
          try {
            const [h, m] = booking.start_time.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            displayTime = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
          } catch { /* use raw */ }

          const serviceName = booking.services?.name || 'your appointment';

          const intakeSection = !hasCompletedIntake && intakeFormUrl ? `
            <tr><td style="padding: 0 32px 32px;">
              <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px; text-align: center;">
                <p style="color: #92400E; font-size: 16px; font-weight: 600; margin: 0 0 8px;">📋 Health Assessment Required</p>
                <p style="color: #78350F; font-size: 14px; margin: 0 0 16px;">Please complete your health history form before your appointment.</p>
                <a href="${intakeFormUrl}" style="display: inline-block; background: #667B68; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Complete Health Form</a>
              </div>
            </td></tr>` : '';

          const confirmationHtml = buildConfirmationEmailWithIntake(
            booking.client_name, serviceName, displayDate, displayTime, intakeSection,
            isInsuranceBooking ? INSURANCE_DISCLAIMER : undefined
          );

          const resend = new Resend(resendApiKey);
          const { error: emailError } = await resend.emails.send({
            from: BRAND.fromSupport,
            to: [booking.client_email],
            subject: `Booking Confirmed — ${serviceName} on ${displayDate}`,
            html: confirmationHtml,
          });

          if (emailError) {
            logStep('Client confirmation email failed', { error: emailError });
          } else {
            logStep('Client confirmation email sent', { to: booking.client_email, hasIntakeLink: !!intakeFormUrl });
          }
        }
      } catch (emailErr) {
        logStep('Client confirmation email error (non-blocking)', { error: String(emailErr) });
      }
    }

    // ALWAYS send client + staff notification (confirmation or decline) — this must not be skipped
    // Use retry logic to handle transient failures
    const notifPayload = JSON.stringify({
      type: action === 'approve' ? 'booking_confirmation' : 'booking_declined',
      bookingId,
      recipientType: 'both',
      depositCharged,
      paymentLinkSent,
      paymentLinkUrl: paymentLinkSent ? paymentLinkUrl : undefined,
    });

    let notifSent = false;
    // Use user JWT or service role key for internal call (some platforms reject service role for JWT-verified functions)
    const notifAuth = authHeader || `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
    for (let attempt = 1; attempt <= 3 && !notifSent; attempt++) {
      try {
        logStep(`Sending notifications (attempt ${attempt}/3)`, { type: action === 'approve' ? 'booking_confirmation' : 'booking_declined' });
        const notifResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': notifAuth.startsWith('Bearer ') ? notifAuth : `Bearer ${notifAuth}`,
            'Content-Type': 'application/json',
          },
          body: notifPayload,
        });
        
        if (notifResponse.ok) {
          const notifResult = await notifResponse.json();
          logStep("Notification sent successfully", notifResult);
          notifSent = true;
        } else {
          const errorText = await notifResponse.text();
          logStep(`Notification HTTP error (attempt ${attempt})`, { status: notifResponse.status, body: errorText });
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      } catch (notifError) {
        logStep(`Notification exception (attempt ${attempt})`, { error: notifError instanceof Error ? notifError.message : String(notifError) });
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (!notifSent) {
      logStep("CRITICAL: All send-notification attempts failed — sending direct staff emails as fallback", { bookingId, action });
      
      // Direct fallback: send practitioner confirmation emails via Resend
      if (action === 'approve') {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const serviceName = booking.services?.name || 'Appointment';

          let displayDate = booking.booking_date;
          try {
            const [yyyy, mm, dd] = booking.booking_date.split('-').map(Number);
            displayDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
            });
          } catch { /* use raw */ }

          const staffHtml = `
            <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;">
              <h1 style="color: #6b8f71; font-size: 24px;">Appointment Confirmed</h1>
              <p>A new appointment has been confirmed on your schedule:</p>
              <ul>
                <li><strong>Client:</strong> ${booking.client_name}</li>
                <li><strong>Email:</strong> ${booking.client_email}</li>
                <li><strong>Phone:</strong> ${booking.client_phone || 'Not provided'}</li>
                <li><strong>Service:</strong> ${serviceName}</li>
                <li><strong>Date:</strong> ${displayDate}</li>
                <li><strong>Time:</strong> ${booking.start_time} - ${booking.end_time}</li>
                ${booking.notes ? `<li><strong>Notes:</strong> ${booking.notes}</li>` : ''}
              </ul>
              <p><a href="${BRAND.siteUrl}/calendar" style="display:inline-block;padding:12px 24px;background-color:#6b8f71;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">View Calendar</a></p>
              <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
                <p style="margin: 4px 0;">${BRAND.name}</p>
                <p style="margin: 4px 0;">${BRAND.address}</p>
              </div>
            </div>`;
          const staffText = `Appointment Confirmed\n\nClient: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${booking.client_phone || 'Not provided'}\nService: ${serviceName}\nDate: ${displayDate}\nTime: ${booking.start_time} - ${booking.end_time}${booking.notes ? '\nNotes: ' + booking.notes : ''}\n\nView calendar: ${BRAND.siteUrl}/calendar\n\n${BRAND.name}\n${BRAND.address}`;
          const staffSubject = `Appointment Confirmed – ${booking.client_name} on ${displayDate}`;

          // Get practitioner emails
          const practitionerEmails: string[] = [];
          if (booking.practitioner_id) {
            const { data: p1 } = await supabase.from('practitioners').select('email').eq('id', booking.practitioner_id).single();
            if (p1?.email) practitionerEmails.push(p1.email);
          }
          if (booking.practitioner_2_id && booking.practitioner_2_id !== booking.practitioner_id) {
            const { data: p2 } = await supabase.from('practitioners').select('email').eq('id', booking.practitioner_2_id).single();
            if (p2?.email) practitionerEmails.push(p2.email);
          }

          for (const email of practitionerEmails) {
            try {
              await new Promise(r => setTimeout(r, 1100));
              await resend.emails.send({
                from: BRAND.fromSupport,
                to: [email],
                subject: staffSubject,
                html: staffHtml,
                text: staffText,
              });
              logStep('Direct fallback staff email sent', { to: email });
            } catch (e) {
              logStep('Direct fallback staff email failed', { to: email, error: String(e) });
            }
          }
        }
      }
    }

    // Calendar sync already handled above (before emails/notifications)

    // ── Klaviyo server-side: track Booking Approved/Declined event ──
    {
      const KLAVIYO_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
      if (KLAVIYO_KEY) {
        try {
          const svcName = booking.services?.name || 'Appointment';
          let displayDate = booking.booking_date;
          try {
            const [yy, mm, dd] = booking.booking_date.split('-').map(Number);
            displayDate = new Date(yy, mm - 1, dd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          } catch {}
          const [th, tm] = booking.start_time.split(':').map(Number);
          const tAmpm = th >= 12 ? 'PM' : 'AM';
          const t12 = th % 12 || 12;
          const displayTime = `${t12}:${String(tm).padStart(2, '0')} ${tAmpm}`;

          const eventName = action === 'approve' ? 'Booking Approved' : 'Booking Cancelled';
          const eventStatus = action === 'approve' ? 'confirmed' : 'cancelled';
          const uniquePrefix = action === 'approve' ? 'approved' : 'cancelled';

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
                  metric: { data: { type: 'metric', attributes: { name: eventName } } },
                  profile: { data: { type: 'profile', attributes: { email: booking.client_email } } },
                  properties: {
                    BookingId: bookingId,
                    ServiceName: svcName,
                    BookingDate: displayDate,
                    StartTime: displayTime,
                    TotalAmount: booking.total_amount || 0,
                    BalanceDue: booking.balance_due || 0,
                    DepositCharged: depositCharged,
                    Status: eventStatus,
                    ...(action === 'decline' && reason ? { DeclineReason: reason } : {}),
                  },
                  time: new Date().toISOString(),
                  unique_id: `${uniquePrefix}_${bookingId}`,
                },
              },
            }),
          });
          if (!eventRes.ok) {
            const errBody = await eventRes.text();
            logStep(`Klaviyo ${eventName} event failed`, { status: eventRes.status, body: errBody });
          } else {
            logStep(`Klaviyo: ${eventName} event tracked`, { email: booking.client_email });
          }
        } catch (klErr) {
          logStep('Klaviyo tracking error (non-blocking)', { error: String(klErr) });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        status: newStatus,
        message: `Booking ${action}d successfully`,
        depositCharged,
        paymentLinkSent,
        depositEmailSent,
        paymentLinkUrl: paymentLinkSent ? paymentLinkUrl : undefined,
        depositError,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in approve-booking:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

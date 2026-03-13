import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { BRAND } from "../_shared/brand.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireStaffOrInternalSecret } from "../_shared/auth.ts";
import { debugLog } from "../_shared/debugLog.ts";
import { logStructured } from "../_shared/logger.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHARGE-BALANCE] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const auth = await requireStaffOrInternalSecret(req, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, corsHeaders, { source: "charge-balance" });
  if (!auth.ok) return auth.response;

  try {
    logStep("Function started");

    const { bookingId, tipAmount, taxAmount } = await req.json();
    logStep("Request parsed", { bookingId, tipAmount, taxAmount });

    if (!bookingId || typeof bookingId !== 'string') {
      throw new Error("Booking ID is required");
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(bookingId)) {
      throw new Error("Invalid booking ID format");
    }

    const tipAmountValue = typeof tipAmount === 'number' && tipAmount > 0 ? tipAmount : 0;
    const taxAmountValue = typeof taxAmount === 'number' && taxAmount > 0 ? taxAmount : 0;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get booking details with service and practitioner info
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, services(name), practitioner:practitioners!bookings_practitioner_id_fkey(name)')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    if (booking.balance_paid) {
      logStep("Balance already paid, returning success");
      return new Response(JSON.stringify({ success: true, message: "Balance already paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Defensive array unwrapping for PostgREST joins
    const rawServices = booking.services;
    booking.services = Array.isArray(rawServices) ? rawServices[0] : rawServices;
    const rawPractitioner = booking.practitioner;
    booking.practitioner = Array.isArray(rawPractitioner) ? rawPractitioner[0] : rawPractitioner;

    // Resolve names early so they're available in all code paths
    const serviceName = booking.services?.name || 'Massage Service';
    const practName = (booking.practitioner as any)?.name || BRAND.name;

    const balanceDue = booking.balance_due || 0;
    const totalCharge = Math.round((balanceDue + taxAmountValue + tipAmountValue) * 100) / 100;

    if (totalCharge <= 0) {
      logStep("No amount to charge");
      await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId);
      await debugLog(supabase, "charge-balance:bookings.update", "Booking completed (no charge)", { booking_id: bookingId });
      return new Response(JSON.stringify({ success: true, message: "No amount to charge" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripeCustomerId = booking.stripe_payment_intent_id;
    logStep("Found booking", {
      clientEmail: booking.client_email,
      balanceDue,
      tipAmount: tipAmountValue,
      totalCharge,
      stripeCustomerId,
    });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const description = `${serviceName} – ${practName} – ${booking.booking_date}`;

    // Try to charge the saved payment method automatically
    if (stripeCustomerId) {
      try {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: stripeCustomerId,
          type: 'card',
          limit: 1,
        });

        if (paymentMethods.data.length > 0) {
          const paymentMethodId = paymentMethods.data[0].id;
          logStep("Found saved payment method, charging off-session", { paymentMethodId });

          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalCharge * 100),
            currency: 'usd',
            customer: stripeCustomerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            description,
            metadata: {
              bookingId,
              type: 'balance_and_tip',
              balanceAmount: String(balanceDue),
              taxAmount: String(taxAmountValue),
              tipAmount: String(tipAmountValue),
            },
          });

          if (paymentIntent.status === 'succeeded') {
            logStep("Charge succeeded", { paymentIntentId: paymentIntent.id });
            logStructured("info", "balance_charge_success", "charge-balance", {
              bookingId,
              paymentIntentId: paymentIntent.id,
              amount: totalCharge,
            });

            // Record balance payment
            if (balanceDue > 0) {
              await supabase.from('booking_payments').insert({
                booking_id: bookingId,
                type: 'balance',
                amount: balanceDue,
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: paymentIntent.id,
              });
            }

            // Record tax
            if (taxAmountValue > 0) {
              await supabase.from('booking_payments').insert({
                booking_id: bookingId,
                type: 'tax',
                amount: taxAmountValue,
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: paymentIntent.id,
              });
            }

            // Record tip separately
            if (tipAmountValue > 0) {
              await supabase.from('booking_payments').insert({
                booking_id: bookingId,
                type: 'tip',
                amount: tipAmountValue,
                status: 'paid',
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: paymentIntent.id,
              });
            }

            // Mark booking balance paid and completed
            await supabase
              .from('bookings')
              .update({ balance_paid: true, status: 'completed' })
              .eq('id', bookingId);
            await debugLog(supabase, "charge-balance:bookings.update", "Balance paid, booking completed", { booking_id: bookingId, total_charge: totalCharge });

            // Send receipt email with full breakdown
            const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
            const serviceTotal = Number(booking.total_amount) || totalCharge;
            const depositPaid = Math.max(0, Math.round((serviceTotal - balanceDue) * 100) / 100);
            if (RESEND_API_KEY && booking.client_email) {
              try {
                const resend = new Resend(RESEND_API_KEY);
                const firstName = booking.client_name.split(' ')[0];
                const formattedDate = new Date(booking.booking_date + 'T12:00:00').toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                });
                const emailHtml = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <h2 style="color: #1e293b;">Thank you for visiting us, ${firstName}!</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                      We hope you enjoyed your <strong>${serviceName}</strong> with <strong>${practName}</strong> on ${formattedDate}.
                    </p>
                    <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Payment Receipt</h3>
                      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        <tr><td style="padding: 6px 0; color: #475569;">Service Total</td><td style="text-align: right; padding: 6px 0;">$${serviceTotal.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 0; color: #475569;">Deposit (paid at booking)</td><td style="text-align: right; padding: 6px 0;">$${depositPaid.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 0; color: #475569;">Balance</td><td style="text-align: right; padding: 6px 0;">$${balanceDue.toFixed(2)}</td></tr>
                        ${taxAmountValue > 0 ? `<tr><td style="padding: 6px 0; color: #475569;">Tax (4.25%)</td><td style="text-align: right; padding: 6px 0;">$${taxAmountValue.toFixed(2)}</td></tr>` : ''}
                        ${tipAmountValue > 0 ? `<tr><td style="padding: 6px 0; color: #475569;">Tip</td><td style="text-align: right; padding: 6px 0;">$${tipAmountValue.toFixed(2)}</td></tr>` : ''}
                        <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 10px 0 0; font-weight: 600; color: #1e293b;">Total Paid</td><td style="text-align: right; padding: 10px 0 0; font-weight: 600; font-size: 16px;">$${totalCharge.toFixed(2)}</td></tr>
                      </table>
                    </div>
                    <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                      It was a pleasure having you, and we look forward to seeing you again soon!
                    </p>
                    <p style="margin-top: 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                      Warmly,<br>${BRAND.name}
                    </p>
                  </div>
                  ${BRAND.emailFooterHtml}`;
                await resend.emails.send({
                  from: BRAND.fromBookings,
                  to: [booking.client_email],
                  subject: `Receipt – $${totalCharge.toFixed(2)} – Thank you for your visit, ${firstName}!`,
                  html: emailHtml,
                });
                logStep("Receipt email sent", { to: booking.client_email });
              } catch (emailErr) {
                logStep("Receipt email failed (non-blocking)", { error: String(emailErr) });
              }
            }

            return new Response(JSON.stringify({
              success: true,
              message: "Payment charged successfully",
              paymentIntentId: paymentIntent.id,
              totalCharged: totalCharge,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
          }

          logStep("Payment requires additional action", { status: paymentIntent.status });
          // Fall through to checkout session
        } else {
          logStep("No saved payment method found, falling back to checkout");
        }
      } catch (stripeError) {
        logStep("Auto-charge failed, falling back to checkout", {
          error: stripeError instanceof Error ? stripeError.message : 'Unknown error'
        });
        // Fall through to checkout session as fallback
      }
    }

    // Fallback: Create a Stripe Checkout session
    let customerId = stripeCustomerId;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: booking.client_email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: booking.client_email,
          name: booking.client_name,
        });
        customerId = customer.id;
      }
    }
    logStep("Using checkout fallback", { customerId });

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    const line_items: any[] = [];
    if (balanceDue > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: serviceName,
            description: `Balance due – ${practName} – ${booking.booking_date}`,
          },
          unit_amount: Math.round(balanceDue * 100),
        },
        quantity: 1,
      });
    }
    if (taxAmountValue > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Hawaii General Excise Tax (4.25%)',
          },
          unit_amount: Math.round(taxAmountValue * 100),
        },
        quantity: 1,
      });
    }
    if (tipAmountValue > 0) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Gratuity',
            description: `Tip for ${practName}`,
          },
          unit_amount: Math.round(tipAmountValue * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items,
      mode: "payment",
      payment_intent_data: { description },
      success_url: `${origin}/complete-payment?paid=true&booking=${bookingId}`,
      cancel_url: `${origin}/complete-payment?booking=${bookingId}`,
      metadata: {
        bookingId,
        type: 'balance_and_tip',
        tipAmount: String(tipAmountValue),
        balanceAmount: String(balanceDue),
        taxAmount: String(taxAmountValue),
      },
    });

    logStep("Checkout session created as fallback", { sessionId: session.id });
    logStructured("info", "balance_checkout_fallback", "charge-balance", {
      bookingId,
      sessionId: session.id,
      reason: "no_saved_card_or_charge_failed",
    });

    // Record pending payment so webhook can reconcile (single record for combined balance+tax+tip)
    await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      type: "balance",
      amount: totalCharge,
      status: "pending",
      stripe_session_id: session.id,
      stripe_checkout_url: session.url,
      sent_to_email: booking.client_email,
    });
    await debugLog(supabase, "charge-balance:booking_payments.insert", "Pending balance payment link created", { booking_id: bookingId, amount: totalCharge });

    // BULLETPROOF: Always email the payment link to the customer when card can't be charged
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    if (RESEND_API_KEY && session.url && booking.client_email) {
      try {
        const resend = new Resend(RESEND_API_KEY);
        const firstName = booking.client_name.split(" ")[0] || "there";
        const formattedDate = new Date(booking.booking_date + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const htmlBody = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
            <h2 style="color: #1e293b;">Complete your payment – ${BRAND.name}</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              Thank you for your ${serviceName} with ${practName} on ${formattedDate}.
            </p>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">
              We couldn't charge your saved card. Please complete your payment of <strong>$${totalCharge.toFixed(2)}</strong>${tipAmountValue > 0 ? ` (including $${tipAmountValue.toFixed(2)} tip)` : ""} using the link below:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${session.url}" style="display:inline-block;padding:16px 36px;background-color:#6b8f71;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:17px;">Pay $${totalCharge.toFixed(2)}</a>
            </div>
            <p style="color: #888; font-size: 14px; line-height: 1.5;">
              If you have any questions, please contact us at ${BRAND.supportEmail}.
            </p>
            <p style="color: #475569; font-size: 16px; line-height: 1.6;">Mahalo,<br/>${BRAND.name}</p>
          </div>
          ${BRAND.emailFooterHtml}`;
        await resend.emails.send({
          from: BRAND.fromBookings,
          to: [booking.client_email],
          subject: `Complete your payment – $${totalCharge.toFixed(2)} – ${BRAND.name}`,
          html: htmlBody,
        });
        emailSent = true;
        logStep("Payment link email sent to customer", { to: booking.client_email });
      } catch (emailErr) {
        logStep("Payment link email failed (non-blocking)", { error: String(emailErr) });
      }
    } else {
      logStep("Resend not configured or no client email, cannot send payment link");
    }

    return new Response(
      JSON.stringify({
        paymentLinkSent: true,
        emailSent,
        url: session.url,
        sessionId: session.id,
        message: emailSent
          ? `Payment link sent to ${booking.client_email}. The customer can complete payment at their convenience.`
          : "Payment link created but email could not be sent. Share the link with the customer manually.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    logStructured("error", "balance_charge_failed", "charge-balance", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

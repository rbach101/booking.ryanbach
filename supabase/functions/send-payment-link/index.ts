import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@6.9.3";
import { BRAND } from "../_shared/brand.ts";

import { getCorsHeaders } from "../_shared/cors.ts";
import { expirePendingDepositsForBooking } from "../_shared/booking-payments.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-PAYMENT-LINK] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    logStep("Function started");

    // --- Authentication: require staff or admin role ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      logStep("Auth failed", { error: claimsError?.message });
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = claimsData.claims.sub as string;
    logStep("Authenticated user", { userId });

    // Verify user has staff or admin role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const hasRole = roles?.some(r => r.role === 'admin' || r.role === 'staff');
    if (!hasRole) {
      logStep("Authorization failed - no staff/admin role", { userId });
      return new Response(JSON.stringify({ error: 'Forbidden: staff or admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    logStep("Authorization passed", { roles: roles?.map(r => r.role) });

    const { bookingId, amount, clientEmail, clientName, serviceName, bookingDate, startTime, tipAmount, practitionerName: reqPractName } = await req.json();
    logStep("Request parsed", { bookingId, amount, clientEmail });

    if (!bookingId || !amount || !clientEmail) {
      throw new Error("bookingId, amount, and clientEmail are required");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    let customerId: string | undefined;
    const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName || "Guest",
        metadata: { source: "staff_payment_link", bookingId },
      });
      customerId = customer.id;
      logStep("Created new customer", { customerId });
    }

    const origin = req.headers.get("origin") || BRAND.siteUrl;
    
    // Fetch practitioner name from booking if not provided
    let practitionerName = reqPractName;
    if (!practitionerName && bookingId) {
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('practitioner:practitioners!bookings_practitioner_id_fkey(name)')
        .eq('id', bookingId)
        .single();
      practitionerName = (bookingData?.practitioner as any)?.name;
    }
    const practLabel = practitionerName || BRAND.name;
    const svcLabel = serviceName || "Appointment";
    const description = `${svcLabel} – ${practLabel} – ${bookingDate || "TBD"} at ${startTime || "TBD"}`;
    const balanceOnly = tipAmount ? amount - tipAmount : amount;

    // Build line items
    const line_items: any[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: svcLabel,
            description,
          },
          unit_amount: Math.round(balanceOnly * 100),
        },
        quantity: 1,
      },
    ];

    if (tipAmount && tipAmount > 0) {
      line_items.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Gratuity",
            description: "Tip for your therapist",
          },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items,
      mode: "payment",
      payment_intent_data: {
        setup_future_usage: "off_session",
        description,
      },
      success_url: `${origin}/pay-balance?paid=true&booking=${bookingId}`,
      cancel_url: `${origin}/pay-balance?booking=${bookingId}`,
      metadata: {
        bookingId,
        type: "staff_payment_link",
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    await supabase
      .from("bookings")
      .update({ stripe_payment_intent_id: customerId })
      .eq("id", bookingId);

    const paymentType = tipAmount ? 'deposit' : 'balance';
    if (paymentType === 'deposit') {
      await expirePendingDepositsForBooking(supabase, bookingId);
    }
    await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      type: paymentType,
      amount: balanceOnly,
      status: 'pending',
      stripe_session_id: session.id,
      stripe_checkout_url: session.url,
      sent_to_email: clientEmail,
    });

    // --- Email the payment link to the client ---
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;

    if (resendApiKey && session.url) {
      try {
        const resend = new Resend(resendApiKey);
        const displayName = clientName || "Valued Guest";
        const displayService = serviceName || "your appointment";
        const displayDate = bookingDate || "";
        const displayTime = startTime || "";
        const formattedAmount = `$${amount.toFixed ? amount.toFixed(2) : amount}`;

        const htmlBody = `
          <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: ${BRAND.primaryColor}; font-size: 24px; margin: 0;">${BRAND.name}</h1>
            </div>
            <h2 style="color: #333; font-size: 20px;">Deposit Payment Request</h2>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi ${displayName},</p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Thank you for booking with us! To confirm your appointment${displayDate ? ` on <strong>${displayDate}</strong>` : ''}${displayTime ? ` at <strong>${displayTime}</strong>` : ''} for <strong>${displayService}</strong>, please complete your <strong>${formattedAmount}</strong> deposit.
            </p>
            <p style="color: #888; font-size: 14px; line-height: 1.5;">
              Your remaining balance will be automatically charged to your card on file after your appointment. You'll receive a receipt and an option to leave a gratuity.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${session.url}" style="display:inline-block;padding:16px 36px;background-color:#6b8f71;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;font-size:17px;">Pay ${formattedAmount} Deposit</a>
            </div>
            <p style="color: #888; font-size: 14px; line-height: 1.5;">
              If you have any questions, please reply to this email or contact us at ${BRAND.supportEmail}.
            </p>
            <p style="color: #555; font-size: 16px; line-height: 1.6;">Mahalo,<br/>${BRAND.name}</p>
          </div>
        `;

        const textBody = `Hi ${displayName},\n\nThank you for booking with ${BRAND.name}! To confirm your appointment${displayDate ? ` on ${displayDate}` : ''}${displayTime ? ` at ${displayTime}` : ''} for ${displayService}, please complete your ${formattedAmount} deposit.\n\nPay here: ${session.url}\n\nMahalo,\n${BRAND.name}`;

        await resend.emails.send({
          from: BRAND.fromBookings,
          to: [clientEmail],
          cc: [BRAND.supportEmail],
          subject: `Deposit Payment – ${formattedAmount} for ${displayService}`,
          html: htmlBody,
          text: textBody,
        });

        emailSent = true;
        logStep("Payment link email sent", { to: clientEmail });
      } catch (emailError) {
        logStep("Email sending failed (non-blocking)", { error: String(emailError) });
      }
    } else {
      logStep("Resend not configured, skipping email");
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id, emailSent }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";
import { verifyDepositToken } from "../_shared/deposit-token.ts";
import { expirePendingDepositsForBooking } from "../_shared/booking-payments.ts";
import { logDepositTokenRejected, logStructured } from "../_shared/logger.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-DEPOSIT-PAYMENT] ${step}${detailsStr}`);
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { bookingId, depositToken, clientEmail, clientName, bookingDate, startTime } = await req.json();

    logStep("Request parsed", { bookingId: !!bookingId, hasToken: !!depositToken });

    if (!depositToken || typeof depositToken !== "string") {
      logDepositTokenRejected("create-deposit-payment", "token_missing", { bookingId: bookingId ?? null });
      return new Response(
        JSON.stringify({ error: "Deposit token is required. Complete the booking form first." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenBookingId = await verifyDepositToken(depositToken);
    if (!tokenBookingId) {
      logDepositTokenRejected("create-deposit-payment", "invalid_or_expired", { bookingId });
      return new Response(
        JSON.stringify({ error: "Invalid or expired deposit token. Please start the booking again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!bookingId || typeof bookingId !== "string") {
      throw new Error("Booking ID is required");
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(bookingId)) {
      throw new Error("Invalid booking ID format");
    }

    if (tokenBookingId !== bookingId) {
      logDepositTokenRejected("create-deposit-payment", "token_booking_mismatch", {
        tokenBookingId,
        requestBookingId: bookingId,
      });
      return new Response(
        JSON.stringify({ error: "Deposit token does not match booking." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clientEmail) {
      throw new Error("Client email is required");
    }

    // Server-side validation: fetch booking and service to get authoritative amounts
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('service_id, total_amount, practitioner_id')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    if (!booking.service_id) {
      throw new Error("Booking has no associated service");
    }

    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('price, deposit_required, name')
      .eq('id', booking.service_id)
      .single();

    // Fetch practitioner name
    let practitionerName = BRAND.name;
    if (booking.practitioner_id) {
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('name')
        .eq('id', booking.practitioner_id)
        .single();
      if (practitioner?.name) practitionerName = practitioner.name;
    }

    if (serviceError || !service) {
      throw new Error("Service not found");
    }

    // Use server-side authoritative amounts
    const totalAmount = Number(service.price);
    const depositAmount = Number(service.deposit_required) || 0;
    const serviceName = service.name;

    if (depositAmount <= 0) {
      throw new Error("This service does not require a deposit");
    }

    logStep("Server-validated amounts", { totalAmount, depositAmount, serviceName });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists in Stripe, or create one
    let customerId;
    const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    } else {
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName || 'Guest',
        metadata: {
          source: 'booking_deposit',
          bookingId,
        },
      });
      customerId = customer.id;
      logStep("Created new Stripe customer", { customerId });
    }

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    const description = `${serviceName} – ${practitionerName} – Deposit – ${bookingDate || 'TBD'} at ${startTime || 'TBD'}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "setup",
      payment_method_types: ['card'],
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      success_url: `${origin}/booking-confirmed?booking=${bookingId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/book-online`,
      metadata: {
        bookingId,
        type: 'deposit_setup',
        depositAmount: depositAmount.toString(),
        totalAmount: totalAmount.toString(),
        balanceDue: (totalAmount - depositAmount).toString(),
        description,
      },
    });

    logStep("Checkout session created (setup mode)", { sessionId: session.id });
    logStructured("info", "deposit_session_created", "create-deposit-payment", {
      bookingId,
      sessionId: session.id,
      depositAmount,
    });

    // Expire any existing pending deposits before creating new one (prevents duplicates)
    await expirePendingDepositsForBooking(supabase, bookingId);

    // Insert booking_payments record so the webhook can find and update it
    const { error: paymentInsertError } = await supabase
      .from('booking_payments')
      .insert({
        booking_id: bookingId,
        amount: depositAmount,
        type: 'deposit',
        status: 'pending',
        stripe_session_id: session.id,
        stripe_checkout_url: session.url,
        sent_to_email: clientEmail,
        sent_at: new Date().toISOString(),
      });

    if (paymentInsertError) {
      logStep("Warning: failed to insert booking_payments record", { error: paymentInsertError.message });
    } else {
      logStep("Inserted pending booking_payments record for deposit");
    }

    // Update booking with server-validated amounts
    await supabase
      .from('bookings')
      .update({
        balance_due: totalAmount - depositAmount,
        total_amount: totalAmount,
        stripe_payment_intent_id: customerId,
      })
      .eq('id', bookingId);

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    logStructured("error", "deposit_session_failed", "create-deposit-payment", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

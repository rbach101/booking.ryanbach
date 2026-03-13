import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-TIP-PAYMENT] ${step}${detailsStr}`);
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

    const { bookingId, tipAmount, clientEmail, clientName, practitionerName, serviceName, bookingDate } = await req.json();
    logStep("Request parsed", { bookingId, tipAmount, clientEmail, practitionerName });

    if (!bookingId || !tipAmount || !clientEmail) {
      throw new Error("bookingId, tipAmount, and clientEmail are required");
    }

    if (tipAmount <= 0 || tipAmount > 1000) {
      throw new Error("Tip amount must be between $0.01 and $1,000");
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    let customerId: string | undefined;
    const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName || "Guest",
      });
      customerId = customer.id;
    }
    logStep("Customer resolved", { customerId });

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Gratuity for ${practitionerName}`,
              description: `Tip from ${clientName} for ${serviceName} on ${bookingDate}`,
            },
            unit_amount: Math.round(tipAmount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      payment_intent_data: {
        description: `Gratuity for ${practitionerName || 'therapist'} – ${serviceName || 'Massage'} – ${bookingDate || ''}`,
      },
      success_url: `${origin}/tip?paid=true&booking=${bookingId}`,
      cancel_url: `${origin}/tip?booking=${bookingId}`,
      metadata: {
        bookingId,
        type: "gratuity",
        practitionerName,
        clientName,
      },
    });

    logStep("Tip checkout session created", { sessionId: session.id });

    // Log tip payment record
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabase.from("booking_payments").insert({
      booking_id: bookingId,
      type: 'tip',
      amount: tipAmount,
      status: 'pending',
      stripe_session_id: session.id,
      stripe_checkout_url: session.url,
      sent_to_email: clientEmail,
    });

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
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
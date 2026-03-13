import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[POS-CHARGE] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try {
    const b = await req.clone().json();
    if (b?.healthCheck) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
    /* not JSON, continue */
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Verify the caller is authenticated admin/staff
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user) throw new Error("Not authenticated");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify role
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const hasRole = roles?.some(r => r.role === "admin" || r.role === "staff");
    if (!hasRole) throw new Error("Unauthorized: admin or staff role required");

    const { amount, description, clientEmail, clientName, bookingId } = await req.json();
    logStep("Request", { amount, description, clientEmail, bookingId });

    if (!amount || amount <= 0) throw new Error("Amount must be greater than 0");
    if (!description) throw new Error("Description is required");
    if (!clientEmail) throw new Error("Client email is required");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: clientEmail, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: clientEmail,
        name: clientName || undefined,
      });
      customerId = customer.id;
    }

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    const taxAmount = Math.round(amount * BRAND.hawaiiGetRate * 100) / 100;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: description,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      },
    ];

    if (taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Hawaii General Excise Tax (4.25%)",
          },
          unit_amount: Math.round(taxAmount * 100),
        },
        quantity: 1,
      });
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      payment_intent_data: {
        description: `POS: ${description} – ${clientName || clientEmail}`,
      },
      success_url: `${origin}/dashboard?pos_paid=true`,
      cancel_url: `${origin}/dashboard`,
      metadata: {
        type: "pos_charge",
        description,
        staffUserId: user.id,
        ...(bookingId ? { bookingId } : {}),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    logStep("Checkout created", { sessionId: session.id });

    // Record the payment in booking_payments if linked to a booking (total = amount + tax)
    if (bookingId) {
      const totalAmount = amount + taxAmount;
      await supabaseAdmin.from("booking_payments").insert({
        booking_id: bookingId,
        amount: totalAmount,
        type: "pos_charge",
        status: "pending",
        stripe_session_id: session.id,
        stripe_checkout_url: session.url,
        sent_to_email: clientEmail,
      });
    }

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

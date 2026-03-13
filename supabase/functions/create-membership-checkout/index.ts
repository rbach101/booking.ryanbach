import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-MEMBERSHIP-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");
    
    const { planId, customerId: customerDbId } = await req.json();
    logStep("Request parsed", { planId, customerDbId });

    // Get the membership plan with stripe price ID
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: plan, error: planError } = await serviceClient
      .from('membership_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      throw new Error("Membership plan not found");
    }

    logStep("Found membership plan", { planName: plan.name, priceId: plan.stripe_price_id || 'none – using price_data' });

    // Get customer info if provided
    let customerEmail = null;
    let customerName = null;
    
    if (customerDbId) {
      const { data: customer } = await serviceClient
        .from('customers')
        .select('email, first_name, last_name')
        .eq('id', customerDbId)
        .single();
      
      if (customer) {
        customerEmail = customer.email;
        customerName = `${customer.first_name} ${customer.last_name}`;
        logStep("Found customer", { email: customerEmail, name: customerName });
      }
    }

    // Check for authenticated user
    const authHeader = req.headers.get("Authorization");
    if (authHeader && !customerEmail) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabaseClient.auth.getUser(token);
      if (data.user?.email) {
        customerEmail = data.user.email;
        logStep("Got email from authenticated user", { email: customerEmail });
      }
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Check if customer exists in Stripe
    let stripeCustomerId;
    if (customerEmail) {
      const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { stripeCustomerId });
      } else if (customerName) {
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
        });
        stripeCustomerId = customer.id;
        logStep("Created new Stripe customer", { stripeCustomerId });
      }
    }

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    // Use subscription mode if a Stripe price ID is configured, otherwise one-time payment
    const hasStripePrice = !!plan.stripe_price_id;
    const taxAmount = Math.round(plan.price * BRAND.hawaiiGetRate * 100) / 100;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = hasStripePrice
      ? [{ price: plan.stripe_price_id, quantity: 1 }]
      : [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: plan.name,
                description: `${plan.sessions_included} session${plan.sessions_included !== 1 ? 's' : ''}/${plan.billing_period}${plan.description ? ' – ' + plan.description : ''}`,
              },
              unit_amount: Math.round(plan.price * 100),
            },
            quantity: 1,
          },
        ];

    // Add Hawaii GET tax for one-time payments (subscriptions: configure tax in Stripe Dashboard)
    if (!hasStripePrice && taxAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Hawaii General Excise Tax (4.25%)',
          },
          unit_amount: Math.round(taxAmount * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      customer_email: stripeCustomerId ? undefined : customerEmail,
      line_items: lineItems,
      mode: hasStripePrice ? "subscription" : "payment",
      success_url: `${origin}/memberships?plan=${planId}${customerDbId ? `&customer=${customerDbId}` : ''}`,
      cancel_url: `${origin}/memberships`,
      metadata: {
        planId,
        customerDbId: customerDbId || '',
        type: 'membership_purchase',
      },
    });

    logStep("Checkout session created", { sessionId: session.id, mode: hasStripePrice ? 'subscription' : 'payment' });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PACKAGE-CHECKOUT] ${step}${detailsStr}`);
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

    const { packageId, customerId: customerDbId, sendPaymentLink } = await req.json();
    logStep("Request parsed", { packageId, customerDbId, sendPaymentLink });

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify caller is staff/admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseClient.auth.getUser(token);
      if (userData.user) {
        const { data: roles } = await serviceClient
          .from('user_roles')
          .select('role')
          .eq('user_id', userData.user.id);
        const isStaffOrAdmin = roles?.some(r => r.role === 'admin' || r.role === 'staff');
        if (!isStaffOrAdmin) {
          throw new Error("Unauthorized: staff or admin role required");
        }
      }
    }

    // Get the package
    const { data: pkg, error: pkgError } = await serviceClient
      .from('session_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      throw new Error("Session package not found");
    }

    logStep("Found package", { name: pkg.name, price: pkg.price });

    // Get customer info
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

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find or create Stripe customer
    let stripeCustomerId;
    if (customerEmail) {
      const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (customers.data.length > 0) {
        stripeCustomerId = customers.data[0].id;
      } else if (customerName) {
        const customer = await stripe.customers.create({
          email: customerEmail,
          name: customerName,
        });
        stripeCustomerId = customer.id;
      }
    }

    const origin = req.headers.get("origin") || BRAND.siteUrl;

    const taxAmount = Math.round(pkg.price * BRAND.hawaiiGetRate * 100) / 100;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: pkg.name,
            description: `${pkg.session_count} sessions – valid for ${pkg.valid_days || 365} days`,
          },
          unit_amount: Math.round(pkg.price * 100),
        },
        quantity: 1,
      },
    ];

    if (taxAmount > 0) {
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
      mode: "payment",
      payment_intent_data: {
        description: `${pkg.name} – ${pkg.session_count} sessions`,
      },
      success_url: `${origin}/memberships?package_purchased=${packageId}&customer=${customerDbId || ''}`,
      cancel_url: `${origin}/memberships`,
      metadata: {
        packageId,
        customerDbId: customerDbId || '',
        type: 'package_purchase',
      },
    });

    logStep("Checkout session created", { sessionId: session.id });

    // If sendPaymentLink, email the checkout URL to the customer
    if (sendPaymentLink && customerEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: BRAND.fromBookings,
              to: [customerEmail],
              cc: [BRAND.supportEmail],
              subject: `Purchase Your ${pkg.name} Package`,
              html: buildPaymentLinkEmail(customerName || 'Valued Client', pkg.name, pkg.price, taxAmount, pkg.session_count, session.url || ''),
            }),
          });
          logStep("Payment link email sent", { status: emailRes.status });
        } catch (emailError) {
          logStep("Failed to send payment link email", { error: String(emailError) });
        }
      }
    }

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

function buildPaymentLinkEmail(name: string, packageName: string, price: number, taxAmount: number, sessions: number, url: string): string {
  const total = price + taxAmount;
  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="color: #5c4a3a;">Your ${packageName} Package</h2>
      <p>Hi ${name},</p>
      <p>Here is your payment link to purchase the <strong>${packageName}</strong> package:</p>
      <ul>
        <li><strong>${sessions} sessions</strong></li>
        <li><strong>$${price.toFixed(2)}</strong> + Hawaii GET (4.25%) $${taxAmount.toFixed(2)} = <strong>$${total.toFixed(2)} total</strong></li>
      </ul>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${url}" style="background-color: #5c4a3a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-size: 16px;">
          Complete Purchase
        </a>
      </p>
      <p style="color: #888; font-size: 13px;">If you have any questions, reply to this email or contact us at ${BRAND.supportEmail}</p>
      <p>Thanks,<br/>${BRAND.name}</p>
    </div>
  `;
}

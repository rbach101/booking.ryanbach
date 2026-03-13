import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@6.9.3";

import { BRAND } from "../_shared/brand.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const body = await req.text();
    let event: Stripe.Event;

    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        logStep("ERROR: Missing stripe-signature header");
        return new Response("Missing signature", { status: 400 });
      }
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      } catch (err) {
        logStep("ERROR: Signature verification failed", { error: String(err) });
        return new Response(`Webhook signature verification failed: ${err}`, { status: 400 });
      }
    } else {
      logStep("WARNING: No STRIPE_WEBHOOK_SECRET set, skipping signature verification");
      event = JSON.parse(body);
    }

    logStep("Event received", { type: event.type, id: event.id });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Idempotency: skip if already processed
    const { data: existing } = await supabase
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) {
      logStep("Event already processed, skipping", { eventId: event.id });
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Claim the event before processing (insert first)
    const { error: insertError } = await supabase
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, event_type: event.type });

    if (!insertError) {
      await debugLog(supabase, "stripe-webhook:stripe_webhook_events.insert", "Webhook event claimed", { event_id: event.id, event_type: event.type });
    }

    if (insertError) {
      // Race: another instance processed it
      logStep("Event claimed by another instance, skipping", { eventId: event.id });
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id || null;

      logStep("Checkout completed", { bookingId, sessionId, paymentIntentId, mode: session.mode });

      // ── Handle Subscription (Membership) Checkout ──
      if (session.mode === "subscription") {
        const planId = session.metadata?.planId;
        const customerDbId = session.metadata?.customerDbId;
        const subscriptionId = typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id || null;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const customerName = session.customer_details?.name || null;

        logStep("Processing subscription checkout", { planId, customerDbId, subscriptionId, customerEmail });

        if (!planId) {
          logStep("No planId in metadata, skipping subscription processing");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get the membership plan details
        const { data: plan, error: planError } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("id", planId)
          .single();

        if (planError || !plan) {
          logStep("ERROR: Could not find membership plan", { planId, error: planError?.message });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Find or create the customer in our DB
        let resolvedCustomerId = customerDbId || null;

        if (!resolvedCustomerId && customerEmail) {
          // Look up by email
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("email", customerEmail)
            .limit(1)
            .maybeSingle();

          if (existingCustomer) {
            resolvedCustomerId = existingCustomer.id;
            logStep("Found existing customer by email", { customerId: resolvedCustomerId });
          } else {
            // Create new customer from Stripe data
            const nameParts = (customerName || "").trim().split(/\s+/);
            const firstName = nameParts[0] || "Unknown";
            const lastName = nameParts.slice(1).join(" ") || "Customer";

            const { data: newCustomer, error: createError } = await supabase
              .from("customers")
              .insert({
                first_name: firstName,
                last_name: lastName,
                email: customerEmail,
              })
              .select("id")
              .single();

            if (createError) {
              logStep("ERROR creating customer", { error: createError.message });
            } else {
              resolvedCustomerId = newCustomer.id;
              logStep("Created new customer", { customerId: resolvedCustomerId, name: customerName });
            }
          }
        }

        if (!resolvedCustomerId) {
          logStep("ERROR: Could not resolve customer ID for membership");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if membership already exists (prevent duplicates)
        const { data: existingMembership } = await supabase
          .from("customer_memberships")
          .select("id")
          .eq("customer_id", resolvedCustomerId)
          .eq("plan_id", planId)
          .eq("status", "active")
          .maybeSingle();

        if (existingMembership) {
          logStep("Active membership already exists, skipping creation", { membershipId: existingMembership.id });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Calculate next billing date
        const nextBillingDate = new Date();
        if (plan.billing_period === "monthly") {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        } else if (plan.billing_period === "yearly") {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        }

        // Create the customer membership
        const { error: membershipError } = await supabase
          .from("customer_memberships")
          .insert({
            customer_id: resolvedCustomerId,
            plan_id: planId,
            status: "active",
            sessions_remaining: plan.sessions_included,
            sessions_used: 0,
            next_billing_date: nextBillingDate.toISOString().split("T")[0],
            stripe_subscription_id: subscriptionId,
          });

        if (membershipError) {
          logStep("ERROR creating membership", { error: membershipError.message });
        } else {
          logStep("Membership created successfully", {
            customerId: resolvedCustomerId,
            planName: plan.name,
            sessionsIncluded: plan.sessions_included,
          });
        }

        // Notify admin users
        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        for (const admin of adminRoles || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "membership",
            title: "New Membership Subscription",
            message: `${customerName || customerEmail} subscribed to ${plan.name} ($${plan.price}/${plan.billing_period})`,
            action_url: "/memberships",
          });
        }

        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Handle Package Purchase Checkout ──
      const packageId = session.metadata?.packageId;
      if (packageId && session.metadata?.type === 'package_purchase') {
        const customerDbIdPkg = session.metadata?.customerDbId;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const customerName = session.customer_details?.name || null;

        logStep("Processing package purchase", { packageId, customerDbIdPkg, customerEmail });

        // Get the package details
        const { data: pkg } = await supabase
          .from("session_packages")
          .select("*")
          .eq("id", packageId)
          .single();

        if (!pkg) {
          logStep("ERROR: Package not found", { packageId });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Resolve customer
        let resolvedPkgCustomerId = customerDbIdPkg || null;

        if (!resolvedPkgCustomerId && customerEmail) {
          const { data: existingCustomer } = await supabase
            .from("customers")
            .select("id")
            .eq("email", customerEmail)
            .limit(1)
            .maybeSingle();

          if (existingCustomer) {
            resolvedPkgCustomerId = existingCustomer.id;
          } else {
            const nameParts = (customerName || "").trim().split(/\s+/);
            const { data: newCustomer } = await supabase
              .from("customers")
              .insert({
                first_name: nameParts[0] || "Unknown",
                last_name: nameParts.slice(1).join(" ") || "Customer",
                email: customerEmail,
              })
              .select("id")
              .single();
            if (newCustomer) resolvedPkgCustomerId = newCustomer.id;
          }
        }

        if (resolvedPkgCustomerId) {
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (pkg.valid_days || 365));

          const { error: pkgError } = await supabase.from("customer_packages").insert({
            customer_id: resolvedPkgCustomerId,
            package_id: packageId,
            sessions_remaining: pkg.session_count,
            sessions_used: 0,
            status: "active",
            expires_at: expiresAt.toISOString().split("T")[0],
          });

          if (pkgError) {
            logStep("ERROR creating customer_package", { error: pkgError.message });
          } else {
            logStep("Package assigned successfully", { customerId: resolvedPkgCustomerId, packageName: pkg.name });
          }

          // Notify admins
          const { data: adminRoles2 } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "admin");

          for (const admin of adminRoles2 || []) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              type: "package",
              title: "Package Purchased",
              message: `${customerName || customerEmail} purchased ${pkg.name} ($${pkg.price})`,
              action_url: "/memberships",
            });
          }
        }

        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Handle Booking Payment Checkout ──
      if (!bookingId) {
        logStep("No bookingId in metadata, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update booking_payments record
      const { data: paymentUpdate, error: paymentError } = await supabase
        .from("booking_payments")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntentId,
        })
        .eq("stripe_session_id", sessionId)
        .select();

      if (paymentError) {
        logStep("Error updating booking_payments", { error: paymentError.message });
      } else {
        logStep("Updated booking_payments", { count: paymentUpdate?.length });
      }

      // Fallback: if no booking_payments record existed (e.g. old deposit sessions), create one
      if ((paymentUpdate?.length || 0) === 0 && (session.mode === "setup" || session.metadata?.type === "deposit_setup")) {
        logStep("No existing booking_payments record found for setup session — inserting fallback");
        const depositAmt = parseFloat(session.metadata?.depositAmount || '0');
        await supabase.from('booking_payments').insert({
          booking_id: bookingId,
          amount: depositAmt,
          type: 'deposit',
          status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_session_id: sessionId,
          stripe_payment_intent_id: paymentIntentId,
          sent_to_email: session.customer_details?.email || '',
        });
        logStep("Fallback booking_payments record inserted for deposit");
      }

      // Determine payment type from the booking_payments record
      const { data: paymentRecord } = await supabase
        .from("booking_payments")
        .select("type, amount")
        .eq("stripe_session_id", sessionId)
        .single();

      const paymentType = paymentRecord?.type || session.metadata?.type || "balance";

      if (session.mode === "setup" || paymentType === "deposit") {
        logStep("Processing deposit payment");
        const { error: bookingError } = await supabase
          .from("bookings")
          .update({
            deposit_paid: true,
            stripe_payment_intent_id: session.customer as string || paymentIntentId,
          })
          .eq("id", bookingId);

        if (bookingError) {
          logStep("Error updating booking deposit", { error: bookingError.message });
        } else {
          logStep("Booking deposit marked as paid");
        }
      } else {
        logStep("Processing balance payment");
        const { error: bookingError } = await supabase
          .from("bookings")
          .update({
            balance_paid: true,
            balance_due: 0,
          })
          .eq("id", bookingId);

        if (bookingError) {
          logStep("Error updating booking balance", { error: bookingError.message });
        } else {
          logStep("Booking balance marked as paid");
        }

        // Send receipt email when customer paid via payment link (balance + tax + tip)
        const balanceAmount = parseFloat(session.metadata?.balanceAmount || "0");
        const taxAmount = parseFloat(session.metadata?.taxAmount || "0");
        const tipAmount = parseFloat(session.metadata?.tipAmount || "0");
        const totalPaid = (session.amount_total || 0) / 100;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const isBalanceAndTip = session.metadata?.type === "balance_and_tip";

        if (customerEmail && totalPaid > 0) {
          const { data: booking } = await supabase
            .from("bookings")
            .select("client_name, client_email, total_amount, balance_due, booking_date, services(name), practitioner:practitioners!bookings_practitioner_id_fkey(name)")
            .eq("id", bookingId)
            .single();

          if (booking) {
            const rawSvc = (booking as any).services;
            const svc = Array.isArray(rawSvc) ? rawSvc[0] : rawSvc;
            const rawPract = (booking as any).practitioner;
            const pract = Array.isArray(rawPract) ? rawPract[0] : rawPract;
            const serviceName = svc?.name || "Massage Service";
            const practName = (pract as any)?.name || BRAND.name;
            const serviceTotal = Number(booking.total_amount) || totalPaid;
            const depositPaid = Math.max(0, Math.round((serviceTotal - balanceAmount) * 100) / 100);
            const firstName = (booking.client_name || "").split(" ")[0] || "there";
            const formattedDate = new Date((booking.booking_date || "") + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const hasBreakdown = session.metadata?.type === "balance_and_tip" && (balanceAmount > 0 || taxAmount > 0 || tipAmount > 0);

            const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
            if (RESEND_API_KEY) {
              try {
                const resend = new Resend(RESEND_API_KEY);
                const receiptRows = hasBreakdown
                  ? `
                        <tr><td style="padding: 6px 0; color: #475569;">Service Total</td><td style="text-align: right; padding: 6px 0;">$${serviceTotal.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 0; color: #475569;">Deposit (paid at booking)</td><td style="text-align: right; padding: 6px 0;">$${depositPaid.toFixed(2)}</td></tr>
                        <tr><td style="padding: 6px 0; color: #475569;">Balance</td><td style="text-align: right; padding: 6px 0;">$${balanceAmount.toFixed(2)}</td></tr>
                        ${taxAmount > 0 ? `<tr><td style="padding: 6px 0; color: #475569;">Tax (4.25%)</td><td style="text-align: right; padding: 6px 0;">$${taxAmount.toFixed(2)}</td></tr>` : ""}
                        ${tipAmount > 0 ? `<tr><td style="padding: 6px 0; color: #475569;">Tip</td><td style="text-align: right; padding: 6px 0;">$${tipAmount.toFixed(2)}</td></tr>` : ""}
                      `
                  : "";
                const emailHtml = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <h2 style="color: #1e293b;">Thank you for visiting us, ${firstName}!</h2>
                    <p style="color: #475569; font-size: 15px; line-height: 1.6;">
                      We hope you enjoyed your <strong>${serviceName}</strong> with <strong>${practName}</strong> on ${formattedDate}.
                    </p>
                    <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
                      <h3 style="margin: 0 0 12px; font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Payment Receipt</h3>
                      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                        ${receiptRows}
                        <tr style="border-top: 1px solid #e2e8f0;"><td style="padding: 10px 0 0; font-weight: 600; color: #1e293b;">Total Paid</td><td style="text-align: right; padding: 10px 0 0; font-weight: 600; font-size: 16px;">$${totalPaid.toFixed(2)}</td></tr>
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
                  to: [customerEmail],
                  subject: `Receipt – $${totalPaid.toFixed(2)} – Thank you for your visit, ${firstName}!`,
                  html: emailHtml,
                });
                logStep("Receipt email sent", { to: customerEmail });
              } catch (emailErr) {
                logStep("Receipt email failed (non-blocking)", { error: String(emailErr) });
              }
            }
          }
        }
      }
    }

    // ── Handle Subscription Renewal (invoice.payment_succeeded) ──
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription;

      // Only process recurring invoices (not the first one which is handled by checkout)
      if (subscriptionId && invoice.billing_reason === "subscription_cycle") {
        logStep("Subscription renewal payment succeeded", { subscriptionId });

        // Find the membership by stripe_subscription_id
        const { data: membership, error: membershipError } = await supabase
          .from("customer_memberships")
          .select("*, membership_plans(sessions_included, billing_period)")
          .eq("stripe_subscription_id", subscriptionId)
          .eq("status", "active")
          .maybeSingle();

        if (membership && !membershipError) {
          const plan = membership.membership_plans as any;
          const nextBillingDate = new Date();
          if (plan?.billing_period === "monthly") {
            nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          } else if (plan?.billing_period === "yearly") {
            nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          }

          // Reset sessions for the new billing cycle
          const { error: updateError } = await supabase
            .from("customer_memberships")
            .update({
              sessions_remaining: plan?.sessions_included || membership.sessions_remaining,
              sessions_used: 0,
              next_billing_date: nextBillingDate.toISOString().split("T")[0],
            })
            .eq("id", membership.id);

          if (updateError) {
            logStep("ERROR resetting membership sessions", { error: updateError.message });
          } else {
            logStep("Membership sessions reset for new billing cycle", {
              membershipId: membership.id,
              newSessions: plan?.sessions_included,
            });
          }
        } else {
          logStep("No active membership found for subscription", { subscriptionId });
        }
      }
    }

    // ── Handle Subscription Cancellation ──
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as any;
      const subscriptionId = subscription.id;

      logStep("Subscription cancelled/deleted", { subscriptionId });

      const { error: cancelError } = await supabase
        .from("customer_memberships")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscriptionId)
        .eq("status", "active");

      if (cancelError) {
        logStep("ERROR cancelling membership", { error: cancelError.message });
      } else {
        logStep("Membership marked as cancelled");
      }
    }

    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.bookingId;

      logStep("Payment intent succeeded", { bookingId, id: paymentIntent.id });

      if (bookingId) {
        await supabase
          .from("booking_payments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
          })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("status", "pending");
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const bookingId = paymentIntent.metadata?.bookingId;
      const failureMessage = paymentIntent.last_payment_error?.message || "Payment failed";

      logStep("Payment intent failed", { bookingId, id: paymentIntent.id, reason: failureMessage });

      if (bookingId) {
        await supabase
          .from("booking_payments")
          .update({ status: "failed" })
          .eq("stripe_payment_intent_id", paymentIntent.id)
          .eq("status", "pending");

        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const { data: booking } = await supabase
          .from("bookings")
          .select("client_name, client_email")
          .eq("id", bookingId)
          .single();

        for (const admin of adminRoles || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "payment-failed",
            title: "Payment Failed",
            message: `Payment failed for ${booking?.client_name || "a client"} (${booking?.client_email || "unknown"}): ${failureMessage}`,
            booking_id: bookingId,
            action_url: "/calendar",
          });
        }
      }
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.bookingId;
      const sessionId = session.id;

      logStep("Async checkout payment failed", { bookingId, sessionId });

      if (bookingId) {
        await supabase
          .from("booking_payments")
          .update({ status: "failed" })
          .eq("stripe_session_id", sessionId)
          .eq("status", "pending");

        const { data: adminRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        const { data: booking } = await supabase
          .from("bookings")
          .select("client_name, client_email")
          .eq("id", bookingId)
          .single();

        for (const admin of adminRoles || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "payment-failed",
            title: "Checkout Payment Failed",
            message: `Checkout payment failed for ${booking?.client_name || "a client"} (${booking?.client_email || "unknown"}). A new payment link may need to be sent.`,
            booking_id: bookingId,
            action_url: "/calendar",
          });
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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

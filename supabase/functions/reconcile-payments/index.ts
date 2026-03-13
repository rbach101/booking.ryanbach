import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { logStructured } from "../_shared/logger.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[RECONCILE-PAYMENTS] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  const auth = requireInternalSecret(req, corsHeaders, { source: "reconcile-payments" });
  if (!auth.ok) return auth.response;

  try {
    logStep("Reconciliation started");
    logStructured("info", "reconcile_started", "reconcile-payments", {});

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Fetch all pending booking_payments that have a Stripe reference
    const { data: pendingPayments, error: fetchError } = await supabase
      .from("booking_payments")
      .select("id, booking_id, type, amount, stripe_session_id, stripe_payment_intent_id")
      .eq("status", "pending");

    if (fetchError) {
      throw new Error(`Failed to fetch pending payments: ${fetchError.message}`);
    }

    logStep("Found pending payments", { count: pendingPayments?.length || 0 });

    const results = {
      checked: 0,
      reconciled: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[],
    };

    for (const payment of pendingPayments || []) {
      results.checked++;

      try {
        // Try by checkout session first
        if (payment.stripe_session_id) {
          const session = await stripe.checkout.sessions.retrieve(payment.stripe_session_id);
          logStep("Checked session", { id: session.id, status: session.status, paymentStatus: session.payment_status });

          if (session.payment_status === "paid" || session.status === "complete") {
            const paymentIntentId = typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id || null;

            await supabase
              .from("booking_payments")
              .update({
                status: "paid",
                paid_at: new Date().toISOString(),
                stripe_payment_intent_id: paymentIntentId || payment.stripe_payment_intent_id,
              })
              .eq("id", payment.id);

            // Update booking flags
            if (payment.type === "deposit") {
              await supabase
                .from("bookings")
                .update({ deposit_paid: true, stripe_payment_intent_id: session.customer as string || paymentIntentId })
                .eq("id", payment.booking_id);
            } else {
              await supabase
                .from("bookings")
                .update({ balance_paid: true, balance_due: 0 })
                .eq("id", payment.booking_id);
            }

            results.reconciled++;
            results.details.push({ id: payment.id, booking_id: payment.booking_id, type: payment.type, action: "marked_paid_via_session" });
            continue;
          }

          // Check if session expired or was abandoned
          if (session.status === "expired") {
            await supabase
              .from("booking_payments")
              .update({ status: "expired" })
              .eq("id", payment.id);

            results.details.push({ id: payment.id, booking_id: payment.booking_id, action: "marked_expired" });
            results.reconciled++;
            continue;
          }
        }

        // Try by payment intent
        if (payment.stripe_payment_intent_id) {
          // Skip if it looks like a customer ID (starts with cus_)
          if (payment.stripe_payment_intent_id.startsWith("cus_")) {
            results.skipped++;
            continue;
          }

          try {
            const pi = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
            logStep("Checked payment intent", { id: pi.id, status: pi.status });

            if (pi.status === "succeeded") {
              await supabase
                .from("booking_payments")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .eq("id", payment.id);

              if (payment.type === "deposit") {
                await supabase.from("bookings").update({ deposit_paid: true }).eq("id", payment.booking_id);
              } else {
                await supabase.from("bookings").update({ balance_paid: true, balance_due: 0 }).eq("id", payment.booking_id);
              }

              results.reconciled++;
              results.details.push({ id: payment.id, booking_id: payment.booking_id, type: payment.type, action: "marked_paid_via_pi" });
              continue;
            }

            if (pi.status === "canceled") {
              await supabase.from("booking_payments").update({ status: "failed" }).eq("id", payment.id);
              results.reconciled++;
              results.details.push({ id: payment.id, action: "marked_failed_canceled_pi" });
              continue;
            }
          } catch (piErr) {
            // Payment intent not found — might be a setup intent or customer ID
            logStep("PI retrieval failed, skipping", { id: payment.stripe_payment_intent_id });
          }
        }

        // No Stripe reference at all
        if (!payment.stripe_session_id && !payment.stripe_payment_intent_id) {
          results.skipped++;
          results.details.push({ id: payment.id, action: "skipped_no_stripe_ref" });
        }
      } catch (err) {
        results.failed++;
        results.details.push({ id: payment.id, error: String(err) });
        logStep("Error processing payment", { id: payment.id, error: String(err) });
      }
    }

    logStep("Reconciliation complete", { checked: results.checked, reconciled: results.reconciled, failed: results.failed, skipped: results.skipped });
    logStructured("info", "reconcile_complete", "reconcile-payments", {
      checked: results.checked,
      reconciled: results.reconciled,
      failed: results.failed,
      skipped: results.skipped,
    });

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    logStructured("error", "reconcile_failed", "reconcile-payments", { error: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

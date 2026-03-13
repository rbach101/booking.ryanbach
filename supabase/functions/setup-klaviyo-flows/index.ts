import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KLAVIYO_API = "https://a.klaviyo.com/api";
const REVISION = "2026-01-15";

function headers(apiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    "Content-Type": "application/vnd.api+json",
    accept: "application/vnd.api+json",
    revision: REVISION,
  };
}

async function getMetrics(apiKey: string): Promise<Map<string, string>> {
  const metricMap = new Map<string, string>();
  let url = `${KLAVIYO_API}/metrics/`;

  while (url) {
    const res = await fetch(url, { method: "GET", headers: headers(apiKey) });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list metrics: ${res.status} ${err}`);
    }
    const data = await res.json();
    for (const metric of data.data || []) {
      metricMap.set(metric.attributes.name, metric.id);
    }
    url = data.links?.next || "";
  }

  return metricMap;
}

async function getExistingFlows(apiKey: string): Promise<Set<string>> {
  const flowNames = new Set<string>();
  let url = `${KLAVIYO_API}/flows/?page[size]=50`;

  while (url) {
    const res = await fetch(url, { method: "GET", headers: headers(apiKey) });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list flows: ${res.status} ${err}`);
    }
    const data = await res.json();
    for (const flow of data.data || []) {
      flowNames.add(flow.attributes.name);
    }
    url = data.links?.next || "";
  }

  return flowNames;
}

interface FlowConfig {
  name: string;
  triggerMetric: string;
  smsBody: string;
  delayMinutes?: number;
  delayHours?: number;
}

function buildFlowDefinition(metricId: string, config: FlowConfig) {
  const actions: any[] = [];
  let entryActionId: string;

  // If there's a delay, add a time-delay action first
  if (config.delayMinutes || config.delayHours) {
    const delayId = "10001";
    const smsId = "10002";

    const delayUnit = config.delayHours ? "hours" : "minutes";
    const delayValue = config.delayHours || config.delayMinutes || 0;

    actions.push({
      temporary_id: delayId,
      type: "time-delay",
      links: { next: smsId },
      data: {
        unit: delayUnit,
        value: delayValue,
        secondary_value: 0,
        timezone: "profile",
        delay_until_time: null,
        delay_until_weekdays: null,
      },
    });

    actions.push({
      temporary_id: smsId,
      type: "send-sms",
      links: { next: null },
      data: {
        message: {
          body: config.smsBody,
          smart_sending_enabled: true,
          transactional: false,
          add_tracking_params: false,
          custom_tracking_params: null,
          additional_filters: null,
          name: `${config.name} SMS`,
        },
        status: "draft",
      },
    });

    entryActionId = delayId;
  } else {
    // No delay — SMS fires immediately
    const smsId = "10001";

    actions.push({
      temporary_id: smsId,
      type: "send-sms",
      links: { next: null },
      data: {
        message: {
          body: config.smsBody,
          smart_sending_enabled: true,
          transactional: false,
          add_tracking_params: false,
          custom_tracking_params: null,
          additional_filters: null,
          name: `${config.name} SMS`,
        },
        status: "draft",
      },
    });

    entryActionId = smsId;
  }

  return {
    data: {
      type: "flow",
      attributes: {
        name: config.name,
        definition: {
          triggers: [
            {
              type: "metric",
              id: metricId,
              trigger_filter: null,
            },
          ],
          profile_filter: null,
          actions,
          entry_action_id: entryActionId,
          reentry_criteria: {
            unit: "day",
            duration: 1,
          },
        },
      },
    },
  };
}

// Flow configurations for Custom Booking
const FLOW_CONFIGS: FlowConfig[] = [
  {
    name: "Custom Booking – Booking Received",
    triggerMetric: "Appointment Created",
    smsBody: `Hi {{ first_name|default:'there' }}! 🌺 Your {{ event.ServiceName }} request for {{ event.BookingDate }} at {{ event.StartTime }} has been received. We'll confirm shortly! - Custom Booking`,
  },
  {
    name: "Custom Booking – Booking Confirmed",
    triggerMetric: "Booking Approved",
    smsBody: `Great news, {{ first_name|default:'there' }}! ✨ Your {{ event.ServiceName }} on {{ event.BookingDate }} at {{ event.StartTime }} is confirmed! {{ event.DepositCharged|yesno:"Your deposit has been charged.,Please complete your deposit to secure your spot." }} See you soon! - Custom Booking`,
  },
  {
    name: "Custom Booking – Appointment Reminder (24h)",
    triggerMetric: "Booking Approved",
    delayHours: 24,
    smsBody: `Reminder: {{ first_name|default:'Hi' }}, your {{ event.ServiceName }} is tomorrow at {{ event.StartTime }}! 🧘 Please arrive 5 min early. Need to reschedule? Reply to this message. - Custom Booking`,
  },
  {
    name: "Custom Booking – Booking Rescheduled",
    triggerMetric: "Booking Rescheduled",
    smsBody: `Hi {{ first_name|default:'there' }}! Your {{ event.ServiceName }} has been updated to {{ event.BookingDate }} at {{ event.StartTime }}. See you then! - Custom Booking`,
  },
  {
    name: "Custom Booking – Post-Visit Thank You",
    triggerMetric: "Client Checked In",
    delayHours: 3,
    smsBody: `Thank you for visiting Custom Booking today, {{ first_name|default:'friend' }}! 🌿 We hope you enjoyed your {{ event.ServiceName }}. We'd love to see you again — book your next session at booking.example.com/book-online. Thanks! 🤙`,
  },
  {
    name: "Custom Booking – Booking Cancelled / Rebook",
    triggerMetric: "Booking Cancelled",
    delayMinutes: 30,
    smsBody: `Hi {{ first_name|default:'there' }}, your {{ event.ServiceName }} appointment has been cancelled. We'd love to help you rebook — visit booking.example.com/book-online to find a new time. Thanks! - Custom Booking`,
  },
  {
    name: "Custom Booking – Coupon Welcome (NEWMEMBER)",
    triggerMetric: "Coupon Signup",
    smsBody: `Hi {{ first_name|default:'there' }}! 🌺 Here's your exclusive coupon code: NEWMEMBER — use it at checkout to get a FREE Biomat add-on ($15 value) with any massage! Book now: booking.example.com/book-online. Thanks! - Custom Booking`,
  },
];

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
    // Auth check — admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    if (!roles?.some((r) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const KLAVIYO_KEY = Deno.env.get("KLAVIYO_PRIVATE_API_KEY");
    if (!KLAVIYO_KEY) {
      return new Response(JSON.stringify({ error: "KLAVIYO_PRIVATE_API_KEY not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Starting Klaviyo flow provisioning...");

    // 0. Seed missing metrics by sending test events to Klaviyo
    const missingMetrics = ["Appointment Created", "Client Checked In", "Coupon Signup", "Booking Rescheduled"];
    const metricMapInitial = await getMetrics(KLAVIYO_KEY);
    const metricsToSeed = missingMetrics.filter((m) => !metricMapInitial.has(m));

    if (metricsToSeed.length > 0) {
      console.log("Seeding missing metrics:", metricsToSeed);
      for (const metricName of metricsToSeed) {
        try {
          const eventPayload = {
            data: {
              type: "event",
              attributes: {
                metric: { data: { type: "metric", attributes: { name: metricName } } },
                profile: {
                  data: {
                    type: "profile",
                    attributes: {
                      email: "system@example.com",
                      first_name: "System",
                      last_name: "Seed",
                    },
                  },
                },
                properties: {
                  ServiceName: "Test Service",
                  BookingDate: "2026-01-01",
                  StartTime: "10:00 AM",
                  PractitionerName: "Test",
                  _seed: true,
                },
                time: new Date().toISOString(),
              },
            },
          };

          const seedRes = await fetch(`${KLAVIYO_API}/events/`, {
            method: "POST",
            headers: headers(KLAVIYO_KEY),
            body: JSON.stringify(eventPayload),
          });

          if (seedRes.ok || seedRes.status === 202) {
            console.log(`Seeded metric "${metricName}"`);
          } else {
            const errText = await seedRes.text();
            console.error(`Failed to seed "${metricName}": ${seedRes.status} ${errText}`);
          }

          await new Promise((r) => setTimeout(r, 1000));
        } catch (err) {
          console.error(`Error seeding "${metricName}":`, err);
        }
      }

      // Wait for Klaviyo to process the events
      console.log("Waiting for Klaviyo to register new metrics...");
      await new Promise((r) => setTimeout(r, 5000));
    }

    // 1. Fetch all metrics to get IDs for our custom events
    const metricMap = await getMetrics(KLAVIYO_KEY);
    console.log("Found metrics:", [...metricMap.keys()]);

    // 2. Check existing flows to avoid duplicates
    const existingFlows = await getExistingFlows(KLAVIYO_KEY);
    console.log("Existing flows:", [...existingFlows]);

    const results: { flow: string; status: string; error?: string }[] = [];

    for (const config of FLOW_CONFIGS) {
      // Skip if flow already exists
      if (existingFlows.has(config.name)) {
        results.push({ flow: config.name, status: "skipped", error: "Flow already exists" });
        console.log(`Skipped "${config.name}" — already exists`);
        continue;
      }

      // Find the metric ID for this trigger
      const metricId = metricMap.get(config.triggerMetric);
      if (!metricId) {
        results.push({
          flow: config.name,
          status: "skipped",
          error: `Metric "${config.triggerMetric}" not found — trigger an event first`,
        });
        console.log(`Skipped "${config.name}" — metric "${config.triggerMetric}" not found`);
        continue;
      }

      // Build and create the flow
      const flowPayload = buildFlowDefinition(metricId, config);

      try {
        // Rate limit: 1/s burst
        await new Promise((r) => setTimeout(r, 1200));

        const res = await fetch(`${KLAVIYO_API}/flows/?additional-fields[flow]=definition`, {
          method: "POST",
          headers: headers(KLAVIYO_KEY),
          body: JSON.stringify(flowPayload),
        });

        if (res.ok) {
          const data = await res.json();
          results.push({ flow: config.name, status: "created" });
          console.log(`Created flow "${config.name}" — ID: ${data.data?.id}`);
        } else {
          const errBody = await res.text();
          results.push({ flow: config.name, status: "failed", error: `${res.status}: ${errBody}` });
          console.error(`Failed to create "${config.name}":`, res.status, errBody);
        }
      } catch (err) {
        results.push({ flow: config.name, status: "failed", error: String(err) });
        console.error(`Error creating "${config.name}":`, err);
      }
    }

    // Log the provisioning action
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      user_email: user.email,
      action: "klaviyo_flows_provisioned",
      resource_type: "integration",
      details: { results },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in setup-klaviyo-flows:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

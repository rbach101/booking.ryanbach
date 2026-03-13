import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch active business rules
    const { data: rules, error: rulesErr } = await supabase
      .from("business_rules")
      .select("*")
      .eq("is_active", true);

    if (rulesErr) throw rulesErr;
    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active rules to check", violations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch recent bookings (last 24 hours) with related data
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: bookings, error: bookErr } = await supabase
      .from("bookings")
      .select("*, services:service_id(name, practitioner_ids, is_couples, is_outcall, is_local)")
      .gte("created_at", since)
      .neq("status", "cancelled");

    if (bookErr) throw bookErr;
    if (!bookings || bookings.length === 0) {
      return new Response(
        JSON.stringify({ message: "No recent bookings to check", violations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch practitioners for context
    const { data: practitioners } = await supabase
      .from("practitioners")
      .select("id, name, specialties, is_active");

    // 4. Check for already-flagged bookings to avoid duplicates
    const bookingIds = bookings.map((b: any) => b.id);
    const { data: existingViolations } = await supabase
      .from("rule_violations")
      .select("booking_id, rule_id")
      .in("booking_id", bookingIds);

    const existingSet = new Set(
      (existingViolations || []).map((v: any) => `${v.booking_id}:${v.rule_id}`)
    );

    // 5. Build AI prompt
    const rulesText = rules.map((r: any, i: number) => `${i + 1}. [${r.severity.toUpperCase()}] ${r.rule_text}`).join("\n");

    const bookingsText = bookings
      .map((b: any) => {
        const svc = b.services;
        const practitioner = practitioners?.find((p: any) => p.id === b.practitioner_id);
        return `- Booking ${b.id}: ${b.client_name}, Service: ${svc?.name || "unknown"}, Practitioner: ${practitioner?.name || "unknown"} (ID: ${b.practitioner_id}), Date: ${b.booking_date} ${b.start_time}-${b.end_time}, Status: ${b.status}`;
      })
      .join("\n");

    const practitionersText = (practitioners || [])
      .map((p: any) => `- ${p.name} (ID: ${p.id}, Active: ${p.is_active}, Specialties: ${(p.specialties || []).join(", ")})`)
      .join("\n");

    const systemPrompt = `You are a booking compliance monitor for Custom Booking. 
Your job is to check recent bookings against the business rules and identify any violations.
Be precise and only flag genuine violations. Do not flag bookings that comply with all rules.
For each violation found, identify the specific rule broken, the booking involved, and explain why it's a violation.`;

    const userPrompt = `BUSINESS RULES:
${rulesText}

PRACTITIONERS:
${practitionersText}

RECENT BOOKINGS:
${bookingsText}

Check each booking against every rule. Return your findings using the check_violations tool. If no violations are found, return an empty violations array.`;

    // 6. Call AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "check_violations",
              description: "Report any business rule violations found in the bookings",
              parameters: {
                type: "object",
                properties: {
                  violations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        booking_id: { type: "string", description: "UUID of the booking" },
                        rule_number: { type: "number", description: "The rule number (1-indexed) that was violated" },
                        severity: { type: "string", enum: ["warning", "critical"] },
                        description: { type: "string", description: "Clear explanation of the violation" },
                      },
                      required: ["booking_id", "rule_number", "severity", "description"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["violations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "check_violations" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ message: "AI returned no violations", violations: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);
    const violations = result.violations || [];

    // 7. Insert new violations and create notifications
    const newViolations = [];
    for (const v of violations) {
      const rule = rules[v.rule_number - 1];
      if (!rule) continue;

      const key = `${v.booking_id}:${rule.id}`;
      if (existingSet.has(key)) continue;

      const { error: insertErr } = await supabase.from("rule_violations").insert({
        rule_id: rule.id,
        booking_id: v.booking_id,
        violation_description: v.description,
        severity: v.severity,
      });

      if (!insertErr) {
        newViolations.push(v);

        // Notify admin users
        const { data: adminUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        for (const admin of adminUsers || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "rule-violation",
            title: `⚠️ Rule Violation Detected`,
            message: v.description,
            booking_id: v.booking_id,
            action_url: "/settings?tab=rules",
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Scan complete. ${newViolations.length} new violation(s) found.`,
        violations: newViolations,
        total_bookings_checked: bookings.length,
        total_rules_checked: rules.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Monitor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-CUSTOM-EMAIL] ${step}${detailsStr}`);
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

    // Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error("Unauthorized");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) throw new Error("Admin access required");

    const { recipients, subject, bodyHtml, bodyText, templateId } = await req.json();
    logStep("Request parsed", { recipientCount: recipients?.length, subject });

    if (!recipients || !recipients.length || !subject || !bodyHtml) {
      throw new Error("recipients, subject, and bodyHtml are required");
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const results: any[] = [];

    for (const recipient of recipients) {
      const { email, name } = recipient;

      // Replace template variables
      const personalizedHtml = bodyHtml
        .replace(/\{\{client_name\}\}/g, name || "Valued Guest")
        .replace(/\{\{email\}\}/g, email);
      const personalizedText = bodyText
        ? bodyText
            .replace(/\{\{client_name\}\}/g, name || "Valued Guest")
            .replace(/\{\{email\}\}/g, email)
        : undefined;
      const personalizedSubject = subject
        .replace(/\{\{client_name\}\}/g, name || "Valued Guest");

      try {
        const { data, error } = await resend.emails.send({
          from: BRAND.fromSupport,
          to: [email],
          subject: personalizedSubject,
          html: personalizedHtml,
          text: personalizedText,
        });

        if (error) throw new Error(JSON.stringify(error));

        // Log to sent_emails
        await supabase.from("sent_emails").insert({
          template_id: templateId || null,
          recipient_email: email,
          recipient_name: name || null,
          subject: personalizedSubject,
          body_html: personalizedHtml,
          sent_by: user.id,
          status: "sent",
          resend_id: data?.id || null,
        });

        results.push({ email, status: "sent", id: data?.id });
        logStep("Email sent", { to: email });

        // Rate limit: 1.1s between sends
        if (recipients.length > 1) {
          await new Promise((r) => setTimeout(r, 1100));
        }
      } catch (emailErr) {
        const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr);
        logStep("Email failed", { to: email, error: errMsg });

        await supabase.from("sent_emails").insert({
          template_id: templateId || null,
          recipient_email: email,
          recipient_name: name || null,
          subject: personalizedSubject,
          body_html: personalizedHtml,
          sent_by: user.id,
          status: "failed",
          error_message: errMsg,
        });

        results.push({ email, status: "failed", error: errMsg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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

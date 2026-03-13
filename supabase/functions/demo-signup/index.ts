import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@6.9.3";
import { BRAND } from "../_shared/brand.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const RYAN_EMAIL = 'ryan.bach91@gmail.com';

const CONFIRMATION_SALES_HTML = `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #333; font-size: 20px;">Why Choose Custom Booking for Your Small Business?</h2>
    <p style="color: #555; line-height: 1.7;">Custom Booking is built specifically for wellness businesses — spas, massage studios, yoga studios, therapy practices, and salons. Here's what makes it different:</p>
    <ul style="color: #555; line-height: 1.8; padding-left: 20px;">
      <li><strong>Custom tailored</strong> — Every feature is configured to match how your business operates. No generic templates.</li>
      <li><strong>Online booking 24/7</strong> — Clients book and pay deposits without calling. You approve when ready.</li>
      <li><strong>Calendar sync</strong> — Connect Google Calendar to avoid double-booking and keep your schedule in one place.</li>
      <li><strong>Automated reminders</strong> — Email and SMS reminders reduce no-shows and keep clients informed.</li>
      <li><strong>Payments & deposits</strong> — Collect deposits, tips, and balances online. Stripe integration included.</li>
      <li><strong>Intake forms & SOAP notes</strong> — HIPAA-ready documentation for health waivers and treatment notes.</li>
      <li><strong>Memberships & packages</strong> — Sell memberships and session packages to increase recurring revenue.</li>
    </ul>
    <p style="color: #555; line-height: 1.7;">We'll contact you soon to set up your demo and answer any questions.</p>
  </div>
`;

serve(async (req) => {
  console.log('[demo-signup] Request received', { method: req.method, url: req.url });
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { name, email, business_name, phone } = body;

    if (!name?.trim() || !email?.trim()) {
      return new Response(JSON.stringify({ error: 'Name and email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return new Response(JSON.stringify({ error: 'Please enter a valid email address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const approvalToken = crypto.randomUUID().replace(/-/g, '');
    const trimmedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();

    await supabase.from('demo_signups').insert({
      name: trimmedName,
      email: trimmedEmail,
      business_name: business_name?.trim() || null,
      phone: phone?.trim() || null,
      approval_token: approvalToken,
      status: 'pending',
    });

    const approveUrl = `${BRAND.siteUrl}/approve-demo?token=${approvalToken}`;
    const resendKey = Deno.env.get('RESEND_API_KEY');

    if (!resendKey) {
      console.error('[demo-signup] RESEND_API_KEY is not set. Emails will not be sent. Add it in Supabase Dashboard → Project Settings → Edge Functions → Secrets.');
    } else {
      const resend = new Resend(resendKey);

      // 1. Notify Ryan
      const ryanResult = await resend.emails.send({
        from: BRAND.fromSupport,
        to: RYAN_EMAIL,
        subject: `[${BRAND.name}] New demo request: ${trimmedName} (${trimmedEmail})`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">New Demo Request</h2>
              <p style="color: #555;">Someone requested a demo from the landing page.</p>
              <p style="color: #555;"><strong>Name:</strong> ${trimmedName}</p>
              <p style="color: #555;"><strong>Email:</strong> ${trimmedEmail}</p>
              <p style="color: #555;"><strong>Business:</strong> ${business_name?.trim() || '—'}</p>
              <p style="color: #555;"><strong>Phone:</strong> ${phone?.trim() || '—'}</p>
              <p style="color: #555; margin: 24px 0;">Click below to approve their demo access. They will receive their login credentials.</p>
              <div style="margin: 24px 0;">
                <a href="${approveUrl}" style="display: inline-block; background: ${BRAND.primaryColor}; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Approve Demo Access</a>
              </div>
              <p style="color: #888; font-size: 12px;">Or copy: ${approveUrl}</p>
              ${BRAND.emailFooterHtml}
            </div>
          `,
        text: `New Demo Request\n\nName: ${trimmedName}\nEmail: ${trimmedEmail}\nBusiness: ${business_name?.trim() || '—'}\nPhone: ${phone?.trim() || '—'}\n\nApprove: ${approveUrl}`,
      });
      if ((ryanResult as { error?: { message?: string } }).error) {
        console.error('[demo-signup] Failed to email Ryan:', (ryanResult as { error: { message: string } }).error?.message || ryanResult);
      }

      // 2. Confirmation + sales info to the person who submitted
      const confirmResult = await resend.emails.send({
        from: BRAND.fromSupport,
        to: trimmedEmail,
        subject: `We received your demo request — ${BRAND.name}`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: ${BRAND.primaryColor}; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Thanks for your interest!</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Hi ${trimmedName}, we received your demo request.</p>
              </div>
              <div style="padding: 32px 24px;">
                <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                  We've received your request and will contact you soon with setup information and next steps to try our booking platform.
                </p>
                <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                  In the meantime, here's why small businesses choose Custom Booking:
                </p>
                ${CONFIRMATION_SALES_HTML}
                <div style="background: #f0f4f0; border-radius: 8px; padding: 16px; text-align: center; margin-top: 24px;">
                  <p style="margin: 0; color: #555; font-size: 14px;">Questions? <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.primaryColor};">${BRAND.supportEmail}</a></p>
                </div>
              </div>
              ${BRAND.emailFooterHtml}
            </div>
          `,
        text: `Thanks for your interest, ${trimmedName}!\n\nWe've received your demo request and will contact you soon with setup information and next steps.\n\nIn the meantime, here's why small businesses choose Custom Booking:\n\nCustom Booking is built specifically for wellness businesses — spas, massage studios, yoga studios, therapy practices, and salons.\n\n• Custom tailored — Every feature is configured to match how your business operates.\n• Online booking 24/7 — Clients book and pay deposits without calling.\n• Calendar sync — Connect Google Calendar to avoid double-booking.\n• Automated reminders — Email and SMS reminders reduce no-shows.\n• Payments & deposits — Collect deposits, tips, and balances online.\n• Intake forms & SOAP notes — HIPAA-ready documentation.\n• Memberships & packages — Sell memberships and session packages.\n\nWe'll contact you soon. Questions? ${BRAND.supportEmail}`,
      });
      if ((confirmResult as { error?: { message?: string } }).error) {
        console.error('[demo-signup] Failed to email submitter:', (confirmResult as { error: { message: string } }).error?.message || confirmResult);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Thanks! We\'ll be in touch soon to set up your demo.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Demo signup error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again.' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

function buildConsentEmailHtml(name: string, consentUrl: string): string {
  const lines = [
    '<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">',
    '  <div style="background-color: #2d5016; padding: 24px 32px;">',
    `    <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">${BRAND.name}</h1>`,
    '  </div>',
    '  <div style="padding: 32px;">',
    '    <h2 style="color: #2d5016; margin: 0 0 16px; font-size: 18px;">SMS Notification Consent</h2>',
    '    <p style="font-size: 15px; line-height: 1.7; color: #333; margin: 0 0 16px;">',
    '      Hi ' + name + ',',
    '    </p>',
    '    <p style="font-size: 15px; line-height: 1.7; color: #333; margin: 0 0 16px;">',
    '      We\'d like to send you SMS text notifications to keep you updated on your schedule. These are <strong>operational messages only</strong> — not marketing. You\'ll receive alerts for:',
    '    </p>',
    '    <ul style="font-size: 14px; line-height: 1.8; color: #333; margin: 0 0 16px; padding-left: 20px;">',
    '      <li><strong>New booking assignments</strong> — when a client books with you</li>',
    '      <li><strong>Client check-in alerts</strong> — when your client arrives</li>',
    '      <li><strong>Appointment reminders</strong> — upcoming session notifications</li>',
    '      <li><strong>Schedule changes</strong> — reschedules or cancellations</li>',
    '    </ul>',
    '    <p style="font-size: 15px; line-height: 1.7; color: #333; margin: 0 0 24px;">',
    '      To opt in, please click the button below. You\'ll be asked to enter your phone number and confirm your consent. You can revoke consent at any time by contacting your administrator.',
    '    </p>',
    '    <div style="text-align: center; margin: 24px 0;">',
    '      <a href="' + consentUrl + '" style="display: inline-block; background-color: #2d5016; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600;">',
    '        Confirm SMS Notifications',
    '      </a>',
    '    </div>',
    '    <p style="font-size: 13px; line-height: 1.6; color: #6b7280; margin: 24px 0 0;">',
    '      Standard message and data rates may apply. Messages are sent via our verified business number. If you did not expect this email, you can safely ignore it.',
    '    </p>',
    '  </div>',
    '  <div style="padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; background-color: #f9fafb;">',
    `    <p style="margin: 4px 0;">${BRAND.name}</p>`,
    `    <p style="margin: 4px 0;">${BRAND.address}</p>`,
    `    <p style="margin: 4px 0;">${BRAND.supportEmail}</p>`,
    '  </div>',
    '</div>',
  ];
  return lines.join('\n');
}

function buildConsentEmailText(name: string, consentUrl: string): string {
  return [
    'Hi ' + name + ',',
    '',
    "We'd like to send you SMS text notifications for new bookings, client check-ins, reminders, and schedule changes.",
    '',
    'To opt in, visit this link and enter your phone number:',
    consentUrl,
    '',
    'You can revoke consent at any time by contacting your administrator.',
    '',
    BRAND.name,
    BRAND.address,
  ].join('\n');
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path (matches health-monitor payload: { healthCheck: true })
  try {
    const body = await req.clone().json().catch(() => null);
    if (body?.healthCheck) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (_) { /* not JSON, continue */ }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'staff']);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: practitioners, error: practError } = await supabaseAdmin
      .from('practitioners')
      .select('id, name, email, phone, sms_consent, sms_consent_token, sms_consent_at')
      .eq('is_active', true);

    if (practError) throw practError;

    const results: { id: string; name: string; email: string; status: string; error?: string }[] = [];

    for (const p of practitioners || []) {
      if (p.sms_consent) {
        results.push({ id: p.id, name: p.name, email: p.email, status: 'already_consented' });
        continue;
      }

      let token = p.sms_consent_token;
      if (!token) {
        token = crypto.randomUUID();
        const { error: updateError } = await supabaseAdmin
          .from('practitioners')
          .update({ sms_consent_token: token })
          .eq('id', p.id);

        if (updateError) {
          console.error('Failed to set token for ' + p.name + ':', updateError);
          results.push({ id: p.id, name: p.name, email: p.email, status: 'error', error: 'Failed to generate token' });
          continue;
        }
      }

      const consentUrl = `${BRAND.siteUrl}/sms-consent/confirm?token=${token}`;
      const emailHtml = buildConsentEmailHtml(p.name, consentUrl);
      const emailText = buildConsentEmailText(p.name, consentUrl);

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: BRAND.fromSupport,
            to: [p.email],
            subject: `Action Required: Confirm SMS Notifications — ${BRAND.name}`,
            html: emailHtml,
            text: emailText,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          console.error('Failed to send email to ' + p.email + ':', errBody);
          results.push({ id: p.id, name: p.name, email: p.email, status: 'email_failed', error: errBody });
        } else {
          results.push({ id: p.id, name: p.name, email: p.email, status: 'email_sent' });
          console.log('SMS consent email sent to ' + p.name + ' (' + p.email + ')');
        }

        // Rate limit: 1.1s delay between sends
        await new Promise(r => setTimeout(r, 1100));
      } catch (emailErr) {
        console.error('Error sending email to ' + p.email + ':', emailErr);
        results.push({ id: p.id, name: p.name, email: p.email, status: 'email_failed', error: String(emailErr) });
      }
    }

    await supabaseAdmin.from('audit_logs').insert({
      user_id: user.id,
      action: 'sms_consent_emails_sent',
      resource_type: 'practitioners',
      details: {
        sent: results.filter(r => r.status === 'email_sent').length,
        skipped: results.filter(r => r.status === 'already_consented').length,
        failed: results.filter(r => r.status === 'email_failed').length,
      },
    });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in send-sms-consent-emails:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

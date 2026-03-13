import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { BRAND } from "../_shared/brand.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    
    // Health check fast path
    if (body.healthCheck) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Resend not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const resend = new Resend(RESEND_API_KEY);

    // Fetch all active practitioners with email
    const { data: practitioners, error } = await supabase
      .from('practitioners')
      .select('name, email')
      .eq('is_active', true);

    if (error || !practitioners?.length) {
      return new Response(JSON.stringify({ error: 'No practitioners found', details: error }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const loginUrl = `${BRAND.siteUrl}/auth`;
    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const p of practitioners) {
      const htmlBody = `
        <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #333;">
          <h2 style="color: #2d5016; margin-bottom: 24px;">Please Log In & Update Your Availability</h2>
          <p style="font-size: 16px; line-height: 1.6;">Aloha ${p.name.split(' ')[0]},</p>
          <p style="font-size: 16px; line-height: 1.6;">We are going to be launching the new software soon. Please log in and update your availability as soon as possible.</p>
          
          <div style="margin: 28px 0; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
            <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #166534;">Your Login Information:</p>
            <p style="margin: 4px 0; font-size: 15px;"><strong>Email:</strong> ${p.email}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #666;">Use the password provided in your invitation email. If you need a reset, use "Forgot Password" on the login page.</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${loginUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; background-color: #2d5016; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">Log In Now</a>
          </div>

          <p style="font-size: 16px; line-height: 1.6;">Reach out with any questions.</p>
          <p style="font-size: 16px; line-height: 1.6;">Mahalo,<br>${BRAND.name}</p>
          ${BRAND.emailFooterHtml}
        </div>
      `;

      const textBody = `Aloha ${p.name.split(' ')[0]},\n\nWe are going to be launching the new software soon. Please log in and update your availability as soon as possible.\n\nYour Login Information:\nEmail: ${p.email}\nLogin Link: ${loginUrl}\n\nUse the password provided in your invitation email. If you need a reset, use "Forgot Password" on the login page.\n\nReach out with any questions.\n\nMahalo,\n${BRAND.name}\n${BRAND.address}\n${BRAND.supportEmail}`;

      try {
        const { error: sendError } = await resend.emails.send({
          from: BRAND.fromSupport,
          to: [p.email],
          subject: 'Please Login and Update Your Availability',
          html: htmlBody,
          text: textBody,
        });

        results.push({ email: p.email, success: !sendError, error: sendError?.message });
        
        // Rate limit: 1.1s delay between sends
        if (practitioners.indexOf(p) < practitioners.length - 1) {
          await new Promise(r => setTimeout(r, 1100));
        }
      } catch (e) {
        results.push({ email: p.email, success: false, error: (e as any).message });
      }
    }

    console.log('Bulk email results:', results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Bulk email error:', error);
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

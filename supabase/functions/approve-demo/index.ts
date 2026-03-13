import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@6.9.3';
import { BRAND } from '../_shared/brand.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { token, action } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing approval token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: signup, error: fetchError } = await supabase
      .from('demo_signups')
      .select('*')
      .eq('approval_token', token)
      .eq('status', 'pending')
      .single();

    if (fetchError || !signup) {
      return new Response(JSON.stringify({ error: 'Invalid or expired demo request link' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reject') {
      await supabase
        .from('demo_signups')
        .update({ status: 'rejected', approved_at: new Date().toISOString() })
        .eq('id', signup.id);
      return new Response(JSON.stringify({ success: true, message: 'Demo request rejected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Approve: create auth user and send credentials
    const tempPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!';

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: signup.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: signup.name,
        password_change_required: true,
      },
    });

    if (createError) {
      if (createError.message?.includes('already been registered')) {
        await supabase
          .from('demo_signups')
          .update({ status: 'rejected', approved_at: new Date().toISOString() })
          .eq('id', signup.id);
        return new Response(JSON.stringify({ error: 'This email already has an account' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw createError;
    }

    await supabase.from('user_roles').insert({ user_id: newUser.user.id, role: 'staff' });
    await supabase.from('profiles').insert({
      id: newUser.user.id,
      email: signup.email,
      full_name: signup.name,
    });

    await supabase
      .from('demo_signups')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', signup.id);

    // Send login credentials to the demo user
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const loginUrl = `${BRAND.siteUrl}/auth`;

    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: BRAND.fromSupport,
          to: signup.email,
          subject: `Your ${BRAND.name} demo access is ready`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: ${BRAND.primaryColor}; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Your demo access is ready</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Hi ${signup.name}, you can now try Custom Booking.</p>
              </div>
              <div style="padding: 32px 24px;">
                <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                  Your demo account has been approved. Sign in below to explore the platform.
                </p>
                <div style="background: #f8faf8; border: 1px solid #e2e8e2; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Email</p>
                  <p style="margin: 0 0 16px; font-family: monospace; font-size: 15px; color: #333;">${signup.email}</p>
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Temporary Password</p>
                  <p style="margin: 0; font-family: monospace; font-size: 15px; color: #333; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #ddd;">${tempPassword}</p>
                </div>
                <p style="color: #e65100; font-size: 13px; margin: 0 0 24px;">⚠️ You'll be asked to set your own password when you first sign in.</p>
                <div style="text-align: center; margin-bottom: 32px;">
                  <a href="${loginUrl}" style="display: inline-block; background: ${BRAND.primaryColor}; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Sign In to Your Demo →</a>
                </div>
                <p style="color: #555; font-size: 14px;">Explore the dashboard, calendar, bookings, and settings. We'll be in touch to answer questions and discuss setup for your business.</p>
                ${BRAND.emailFooterHtml}
              </div>
            </div>
          `,
          text: `Your demo access is ready!\n\nHi ${signup.name},\n\nSign in: ${loginUrl}\nEmail: ${signup.email}\nTemporary Password: ${tempPassword}\n\nYou'll set your own password on first login. We'll be in touch to discuss setup for your business.`,
        });
      } catch (e) {
        console.error('Failed to send demo credentials email:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Demo approved. They will receive their login credentials via email.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Approve demo error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Something went wrong',
    }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

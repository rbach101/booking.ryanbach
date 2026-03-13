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
    const { token, action } = body; // action: 'approve' | 'reject'

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing approval token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: invite, error: fetchError } = await supabase
      .from('pending_invites')
      .select('*')
      .eq('approval_token', token)
      .eq('status', 'pending')
      .single();

    if (fetchError || !invite) {
      return new Response(JSON.stringify({ error: 'Invalid or expired invite link' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'reject') {
      await supabase
        .from('pending_invites')
        .update({ status: 'rejected', approved_at: new Date().toISOString() })
        .eq('id', invite.id);
      return new Response(JSON.stringify({ success: true, message: 'Invite rejected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Approve: create auth user and send welcome email
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: invite.email,
      password: invite.temp_password,
      email_confirm: true,
      user_metadata: {
        full_name: invite.name,
        password_change_required: true,
      },
    });

    if (createError) {
      if (createError.message?.includes('already been registered')) {
        await supabase
          .from('pending_invites')
          .update({ status: 'rejected', approved_at: new Date().toISOString() })
          .eq('id', invite.id);
        return new Response(JSON.stringify({ error: 'This user already has an account' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw createError;
    }

    await supabase.from('user_roles').insert({ user_id: newUser.user.id, role: invite.role });
    if (invite.practitioner_id) {
      await supabase
        .from('practitioners')
        .update({ user_id: newUser.user.id })
        .eq('id', invite.practitioner_id);
    }
    await supabase.from('profiles').insert({
      id: newUser.user.id,
      email: invite.email,
      full_name: invite.name,
    });

    await supabase
      .from('pending_invites')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Send welcome email to the new user
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const loginUrl = `${BRAND.siteUrl}/auth`;
        const staffName = invite.name || invite.email.split('@')[0];
        await resend.emails.send({
          from: BRAND.fromSupport,
          to: invite.email,
          subject: `Your ${BRAND.name} Login — Online Booking for Your Small Business`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
              <div style="background: ${BRAND.primaryColor}; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to ${BRAND.name}</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Your account is ready, ${staffName}.</p>
              </div>
              <div style="padding: 32px 24px;">
                <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                  Your access has been approved. ${BRAND.name} is an all-in-one booking system built for small businesses.
                </p>
                <h2 style="color: #333; font-size: 18px; margin: 0 0 16px;">Your Login Credentials</h2>
                <div style="background: #f8faf8; border: 1px solid #e2e8e2; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Email</p>
                  <p style="margin: 0 0 16px; font-family: monospace; font-size: 15px; color: #333;">${invite.email}</p>
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Temporary Password</p>
                  <p style="margin: 0; font-family: monospace; font-size: 15px; color: #333; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #ddd;">${invite.temp_password}</p>
                </div>
                <p style="color: #e65100; font-size: 13px; margin: 0 0 24px;">⚠️ You'll be asked to set your own password when you first sign in.</p>
                <div style="text-align: center; margin-bottom: 32px;">
                  <a href="${loginUrl}" style="display: inline-block; background: ${BRAND.primaryColor}; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Sign In to Your Account →</a>
                </div>
                ${BRAND.emailFooterHtml}
              </div>
            </div>
          `,
          text: `Welcome to ${BRAND.name}\n\nHi ${staffName},\n\nYour access has been approved.\n\nEmail: ${invite.email}\nTemporary Password: ${invite.temp_password}\n\nSign in: ${loginUrl}\n\nYou'll be asked to set your own password when you first sign in.`,
        });
      } catch (e) {
        console.error('Failed to send welcome email:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Invite approved. The user has been created and will receive their credentials via email.',
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Approve invite error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Something went wrong',
    }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }
});

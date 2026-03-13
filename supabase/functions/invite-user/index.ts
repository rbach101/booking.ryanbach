import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@4.0.0';
import { BRAND } from '../_shared/brand.ts';
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Use getClaims for JWT validation (works with Lovable Cloud ES256 signing)
    const token = authHeader.replace('Bearer ', '');
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('Invalid or expired token:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const requestingUserId = claimsData.claims.sub;

    // Check if the requesting user is an admin
    const { data: roles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUserId);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Only admins can invite users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, name, role, practitioner_id } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate a temporary password
    const tempPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!';

    // Create the user with password_change_required flag
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // Auto-confirm email for invited users
      user_metadata: {
        full_name: name || email.split('@')[0],
        password_change_required: true,
      },
    });

    if (createError) {
      console.error('Create user error:', createError);

      // Specific handling for duplicate email
      if (createError.message?.includes('already been registered')) {
        return new Response(JSON.stringify({
          error: `A user with the email "${email}" already exists. Please use a different email or link the existing account instead.`,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign role to the new user
    const userRole = role || 'staff';
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({ user_id: newUser.user.id, role: userRole });

    if (roleError) {
      console.error('Role assignment error:', roleError);
    }

    // If practitioner_id is provided, link the user to that practitioner
    if (practitioner_id) {
      const { error: practitionerError } = await supabaseClient
        .from('practitioners')
        .update({ user_id: newUser.user.id })
        .eq('id', practitioner_id);

      if (practitionerError) {
        console.error('Practitioner link error:', practitionerError);
      }
    }

    // Create a profile for the user
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .insert({
        id: newUser.user.id,
        email: email,
        full_name: name || email.split('@')[0],
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
    }

    // Send welcome email with login info and onboarding guide
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        const loginUrl = `${BRAND.siteUrl}/auth`;
        const staffName = name || email.split('@')[0];
        await resend.emails.send({
          from: BRAND.fromSupport,
          to: email,
          subject: `Welcome to the ${BRAND.name} Team! 🌺`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
              <div style="background: ${BRAND.primaryColor}; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Welcome to ${BRAND.name}! 🌺</h1>
                <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">We're thrilled to have you on the team, ${staffName}.</p>
              </div>

              <div style="padding: 32px 24px;">
                <h2 style="color: #333; font-size: 18px; margin: 0 0 16px;">Your Login Credentials</h2>
                <div style="background: #f8faf8; border: 1px solid #e2e8e2; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Email</p>
                  <p style="margin: 0 0 16px; font-family: monospace; font-size: 15px; color: #333;">${email}</p>
                  <p style="margin: 0 0 8px; color: #666; font-size: 13px;">Temporary Password</p>
                  <p style="margin: 0; font-family: monospace; font-size: 15px; color: #333; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px solid #ddd;">${tempPassword}</p>
                </div>
                <p style="color: #e65100; font-size: 13px; margin: 0 0 24px;">⚠️ You'll be asked to set your own password when you first sign in.</p>

                <div style="text-align: center; margin-bottom: 32px;">
                  <a href="${loginUrl}" style="display: inline-block; background: ${BRAND.primaryColor}; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Sign In to Your Account →</a>
                </div>

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />

                <h2 style="color: #333; font-size: 18px; margin: 0 0 16px;">📋 Quick Start Guide</h2>
                <ol style="color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
                  <li><strong>Sign in</strong> using the button above with your email and temporary password.</li>
                  <li><strong>Set your password</strong> — you'll be prompted to choose a secure one.</li>
                  <li><strong>Check your schedule</strong> — view upcoming appointments on the <strong>Calendar</strong> page.</li>
                  <li><strong>Review bookings</strong> — new bookings may need your approval in the <strong>Dashboard</strong>.</li>
                  <li><strong>Add SOAP notes</strong> — document sessions after each appointment.</li>
                </ol>

                <h2 style="color: #333; font-size: 18px; margin: 0 0 16px;">💡 Things to Know</h2>
                <ul style="color: #555; line-height: 1.8; padding-left: 20px; margin: 0 0 24px;">
                  <li>Your schedule and availability can be managed from <strong>My Settings</strong>.</li>
                  <li>You'll receive <strong>email & in-app notifications</strong> for new bookings and check-ins.</li>
                  <li>Client intake forms are available under <strong>Intake Forms</strong> for review before appointments.</li>
                  <li>Use the <strong>internal messaging</strong> system to communicate with the team.</li>
                  <li>For any questions, reach out to your admin or reply to this email.</li>
                </ul>

                <div style="background: #f0f4f0; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="margin: 0; color: #555; font-size: 14px;">Questions? Contact us at <a href="mailto:${BRAND.supportEmail}" style="color: ${BRAND.primaryColor};">${BRAND.supportEmail}</a></p>
                </div>
              </div>

              ${BRAND.emailFooterHtml}
            </div>
          `,
          text: `Welcome to ${BRAND.name}! 🌺\n\nHi ${staffName},\n\nWe're thrilled to have you on the team!\n\n--- Your Login Credentials ---\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\n⚠️ You'll be asked to set your own password when you first sign in.\n\nSign in here: ${loginUrl}\n\n--- Quick Start Guide ---\n1. Sign in using your email and temporary password.\n2. Set your password — you'll be prompted to choose a secure one.\n3. Check your schedule — view upcoming appointments on the Calendar page.\n4. Review bookings — new bookings may need your approval in the Dashboard.\n5. Add SOAP notes — document sessions after each appointment.\n\n--- Things to Know ---\n• Your schedule and availability can be managed from My Settings.\n• You'll receive email & in-app notifications for new bookings and check-ins.\n• Client intake forms are available under Intake Forms for review before appointments.\n• Use the internal messaging system to communicate with the team.\n• For any questions, reach out to your admin or reply to this email.${BRAND.emailFooterText}`,
        });
      } catch (e) {
        console.error('Failed to send welcome email:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUser.user.id,
        email: email,
        message: resendKey
          ? 'User created. They will receive their temporary password via email.'
          : 'User created. Password delivery failed - use password reset to send them a secure link.',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Invite user error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

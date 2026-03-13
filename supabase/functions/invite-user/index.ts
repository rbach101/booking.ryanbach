import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@6.9.3';
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

    let body: { email?: string; name?: string; role?: string; practitioner_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid request body: expected JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { email, name, role, practitioner_id } = body;

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check for existing pending invite
    const { data: existingInvite } = await supabaseClient
      .from('pending_invites')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .maybeSingle();
    if (existingInvite) {
      return new Response(JSON.stringify({
        error: `An invite for "${email}" is already pending approval.`,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tempPassword = crypto.randomUUID().slice(0, 12) + 'Aa1!';
    const approvalToken = crypto.randomUUID().replace(/-/g, '');
    const userRole = role || 'staff';

    const { data: pendingInvite, error: insertError } = await supabaseClient
      .from('pending_invites')
      .insert({
        email: email.toLowerCase().trim(),
        name: name?.trim() || email.split('@')[0],
        role: userRole,
        practitioner_id: practitioner_id || null,
        temp_password: tempPassword,
        approval_token: approvalToken,
        invited_by: requestingUserId,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert pending invite error:', insertError);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const approveUrl = `${BRAND.siteUrl}/approve-invite?token=${approvalToken}`;
    const staffName = name || email.split('@')[0];

    // Notify Ryan
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const RYAN_EMAIL = 'ryan.bach91@gmail.com';
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: BRAND.fromSupport,
          to: RYAN_EMAIL,
          subject: `[${BRAND.name}] New user invite — Approve to activate: ${staffName} (${email})`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">New User Invite Pending Approval</h2>
              <p style="color: #555;">A new user has been invited and needs your approval before their credentials are activated.</p>
              <p style="color: #555;"><strong>Name:</strong> ${staffName}</p>
              <p style="color: #555;"><strong>Email:</strong> ${email}</p>
              <p style="color: #555;"><strong>Role:</strong> ${userRole}</p>
              <p style="color: #555; margin: 24px 0;">Click below to approve and activate their account. They will then receive their login credentials via email.</p>
              <div style="margin: 24px 0;">
                <a href="${approveUrl}" style="display: inline-block; background: ${BRAND.primaryColor}; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">Approve & Activate</a>
              </div>
              <p style="color: #888; font-size: 12px;">Or copy this link: ${approveUrl}</p>
              ${BRAND.emailFooterHtml}
            </div>
          `,
          text: `New User Invite Pending Approval\n\nName: ${staffName}\nEmail: ${email}\nRole: ${userRole}\n\nApprove: ${approveUrl}`,
        });
      } catch (e) {
        console.error('Failed to send approval notification to Ryan:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invite_id: pendingInvite.id,
        email: email,
        message: 'Invite created. Ryan will receive a notification and must approve before the user receives their credentials.',
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

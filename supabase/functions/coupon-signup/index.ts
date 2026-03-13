import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@6.9.3";
import { BRAND } from "../_shared/brand.ts";

import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, phone } = await req.json();

    if (!email || !phone) {
      return new Response(JSON.stringify({ error: 'Email and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if already signed up
    const { data: existing } = await supabase
      .from('coupon_signups')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ 
        success: true, 
        alreadySignedUp: true,
        message: 'You already have the NEWMEMBER coupon! Check your texts.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format phone to E.164
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) formattedPhone = '1' + formattedPhone;
    if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

    // Save signup
    await supabase.from('coupon_signups').insert({
      email: email.toLowerCase().trim(),
      phone: formattedPhone,
      coupon_code: 'NEWMEMBER',
      source: 'popup',
    });

    // 1) Subscribe to Klaviyo SMS list
    const klaviyoKey = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
    const klaviyoListId = Deno.env.get('KLAVIYO_SMS_LIST_ID');
    
    if (klaviyoKey && klaviyoListId) {
      try {
        // Create/update profile
        const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
            'revision': '2024-02-15',
          },
          body: JSON.stringify({
            data: {
              type: 'profile',
              attributes: {
                email: email.toLowerCase().trim(),
                phone_number: formattedPhone,
                properties: {
                  coupon_code: 'NEWMEMBER',
                  signup_source: 'biomat_coupon_popup',
                },
              },
            },
          }),
        });

        let profileId: string | null = null;
        const profileData = await profileRes.json();
        
        if (profileRes.status === 409) {
          // Profile exists, get ID from meta
          profileId = profileData?.errors?.[0]?.meta?.duplicate_profile_id;
        } else if (profileRes.ok) {
          profileId = profileData?.data?.id;
        }

        // Subscribe to SMS list
        if (profileId) {
          await fetch(`https://a.klaviyo.com/api/lists/${klaviyoListId}/relationships/profiles/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
              'revision': '2024-02-15',
            },
            body: JSON.stringify({
              data: [{ type: 'profile', id: profileId }],
            }),
          });
        }

        // Track event for Klaviyo flow trigger
        await fetch('https://a.klaviyo.com/api/events/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Klaviyo-API-Key ${klaviyoKey}`,
            'revision': '2024-02-15',
          },
          body: JSON.stringify({
            data: {
              type: 'event',
              attributes: {
                metric: { data: { type: 'metric', attributes: { name: 'Coupon Signup' } } },
                profile: { data: { type: 'profile', attributes: { email: email.toLowerCase().trim(), phone_number: formattedPhone } } },
                properties: {
                  coupon_code: 'NEWMEMBER',
                  coupon_value: 'Free Amethyst Biomat',
                  source: 'website_popup',
                },
              },
            },
          }),
        });

        console.log('Klaviyo subscription + event tracked for', email);
      } catch (e) {
        console.error('Klaviyo error (non-fatal):', e);
      }
    }

    // 2) Send welcome email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: BRAND.fromSupport,
          to: email.toLowerCase().trim(),
          subject: '🎁 Your Free Amethyst Biomat Coupon is Here!',
          html: buildCouponEmailHtml(),
          text: buildCouponEmailText(),
        });
        console.log('Coupon email sent to', email);
      } catch (e) {
        console.error('Resend error (non-fatal):', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Coupon signup error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process signup' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildCouponEmailHtml(): string {
  const heading = 'Your Free Amethyst Biomat Add-On!';
  const body = `
    <p>Mahalo for signing up! Here's your exclusive coupon code:</p>
    <div style="text-align:center; margin: 24px 0;">
      <div style="display:inline-block; background-color: ${BRAND.primaryColor}; color: #ffffff; padding: 16px 32px; border-radius: 8px; font-size: 28px; font-weight: bold; letter-spacing: 4px;">
        NEWMEMBER
      </div>
    </div>
    <p>Use this code at checkout when booking any massage to get a <strong>free Amethyst Biomat add-on</strong> ($15 value)!</p>
    <p style="color: #6b7280; font-size: 14px;">Simply add the Amethyst Biomat to your extras during booking, enter the code, and enjoy the infrared heat therapy on us. 🌺</p>
    <p style="color: #6b7280; font-size: 14px;">This code is single-use per customer.</p>
    <div style="text-align:center; margin: 24px 0;">
      <a href="${BRAND.siteUrl}" style="display:inline-block; background-color: ${BRAND.primaryColor}; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Book Now</a>
    </div>
  `;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: ${BRAND.primaryColor}; font-size: 24px;">${heading}</h1>
    </div>
    ${body}
    ${BRAND.emailFooterHtml}
  </body></html>`;
}

function buildCouponEmailText(): string {
  return `Your Free Amethyst Biomat Add-On!\n\nMahalo for signing up! Here's your exclusive coupon code:\n\nNEWMEMBER\n\nUse this code at checkout when booking any massage to get a free Amethyst Biomat add-on ($15 value)!\n\nSimply add the Amethyst Biomat to your extras during booking, enter the code, and enjoy the infrared heat therapy on us.\n\nThis code is single-use per customer.\n\nBook now: ${BRAND.siteUrl}${BRAND.emailFooterText}`;
}

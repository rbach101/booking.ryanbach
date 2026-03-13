import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, phone, triggerEvent } = await req.json();

    if (!name || !email || !phone) {
      return new Response(JSON.stringify({ error: 'name, email, and phone are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const KLAVIYO_PRIVATE_API_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
    const KLAVIYO_SMS_LIST_ID = Deno.env.get('KLAVIYO_SMS_LIST_ID');

    if (!KLAVIYO_PRIVATE_API_KEY || !KLAVIYO_SMS_LIST_ID) {
      return new Response(JSON.stringify({ error: 'Klaviyo keys not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Format phone to E.164
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const phoneForKlaviyo = cleanPhone.startsWith('+') ? cleanPhone : `+1${cleanPhone}`;

    const klaviyoHeaders = {
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2024-10-15',
    };

    // If triggerEvent is specified, fire a Klaviyo event instead of subscribing
    if (triggerEvent) {
      console.log(`Triggering event "${triggerEvent}" for ${email} / ${phoneForKlaviyo}`);

      const nameParts = name.trim().split(/\s+/);
      const eventPayload = {
        data: {
          type: 'event',
          attributes: {
            metric: { data: { type: 'metric', attributes: { name: triggerEvent } } },
            profile: {
              data: {
                type: 'profile',
                attributes: {
                  email,
                  phone_number: phoneForKlaviyo,
                  first_name: nameParts[0] || '',
                  last_name: nameParts.slice(1).join(' ') || '',
                },
              },
            },
            properties: {
              ServiceName: 'Deep Tissue Massage',
              BookingDate: 'March 10, 2026',
              StartTime: '10:00 AM',
              PractitionerName: 'Jaylynn',
              DepositCharged: true,
              BookingId: 'test-' + Date.now(),
            },
            time: new Date().toISOString(),
          },
        },
      };

      const eventRes = await fetch('https://a.klaviyo.com/api/events/', {
        method: 'POST',
        headers: klaviyoHeaders,
        body: JSON.stringify(eventPayload),
      });

      const eventStatus = eventRes.status;
      const eventBody = await eventRes.text();
      console.log('Event response:', eventStatus, eventBody);

      return new Response(JSON.stringify({
        success: eventRes.ok || eventStatus === 202,
        event: triggerEvent,
        eventStatus,
        eventResponse: eventBody || 'empty (202 accepted)',
        phone: phoneForKlaviyo,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Subscribing phone:', phoneForKlaviyo, 'email:', email, 'to list:', KLAVIYO_SMS_LIST_ID);

    // Step 1: Create/update profile
    const nameParts = name.trim().split(/\s+/);
    const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email,
            phone_number: phoneForKlaviyo,
            first_name: nameParts[0] || '',
            last_name: nameParts.slice(1).join(' ') || '',
          },
        },
      }),
    });

    let profileId: string | null = null;
    if (profileRes.status === 201) {
      const profileData = await profileRes.json();
      profileId = profileData.data?.id;
    } else if (profileRes.status === 409) {
      const errData = await profileRes.json();
      profileId = errData?.errors?.[0]?.meta?.duplicate_profile_id;
    } else {
      const errBody = await profileRes.text();
      return new Response(JSON.stringify({ error: 'Profile creation failed', details: errBody }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Subscribe to SMS list
    const subscribePayload = {
      data: {
        type: 'profile-subscription-bulk-create-job',
        attributes: {
          profiles: {
            data: [{
              type: 'profile',
              attributes: {
                email,
                phone_number: phoneForKlaviyo,
                subscriptions: { sms: { marketing: { consent: 'SUBSCRIBED' } } },
              },
            }],
          },
        },
        relationships: {
          list: { data: { type: 'list', id: KLAVIYO_SMS_LIST_ID } },
        },
      },
    };

    const subscribeRes = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers: klaviyoHeaders,
      body: JSON.stringify(subscribePayload),
    });

    const subscribeStatus = subscribeRes.status;
    const subscribeBody = await subscribeRes.text();

    return new Response(JSON.stringify({
      success: subscribeRes.ok || subscribeStatus === 202,
      profileId,
      subscribeStatus,
      subscribeResponse: subscribeBody || 'empty (202 accepted)',
      listId: KLAVIYO_SMS_LIST_ID,
      phone: phoneForKlaviyo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

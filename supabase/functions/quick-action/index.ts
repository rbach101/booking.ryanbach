import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Derive HMAC key from service role key (consistent, available in all edge functions)
async function getHmacKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(SUPABASE_SERVICE_ROLE_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

// HMAC-signed token: base64(payload).base64(signature)
async function generateActionToken(bookingId: string, action: string): Promise<string> {
  const payload = {
    bookingId,
    action,
    exp: Date.now() + (48 * 60 * 60 * 1000) // 48 hours
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = encodeBase64(payloadBytes.buffer as ArrayBuffer);

  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, payloadBytes);
  const sigB64 = encodeBase64(sig as ArrayBuffer);

  return `${payloadB64}.${sigB64}`;
}

async function parseActionToken(token: string): Promise<{ bookingId: string; action: string; exp: number } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;
    const payloadBytes = decodeBase64(payloadB64);
    const sigBytes = decodeBase64(sigB64);

    const key = await getHmacKey();
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, payloadBytes.buffer as ArrayBuffer);
    if (!valid) {
      console.error('HMAC signature verification failed — possible forgery attempt');
      return null;
    }

    return JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    // Handle token-based quick actions (GET requests from email links)
    if (req.method === 'GET' && token) {
      const payload = await parseActionToken(token);
      
      if (!payload) {
        return new Response(renderHTML('Invalid Link', 'This link is invalid or has been tampered with.', 'error'), {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      if (Date.now() > payload.exp) {
        return new Response(renderHTML('Link Expired', 'This action link has expired. Please log in to the dashboard to manage this booking.', 'error'), {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Get booking details
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          services:service_id (name),
          practitioners:practitioner_id (name),
          practitioner2:practitioner_2_id (name)
        `)
        .eq('id', payload.bookingId)
        .single();

      if (bookingError || !booking) {
        return new Response(renderHTML('Booking Not Found', 'This booking no longer exists.', 'error'), {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' }
        });
      }

      // Format booking info for display
      const bookingDate = new Date(booking.booking_date + 'T00:00:00');
      const formattedDate = bookingDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      });
      const [hours, minutes] = booking.start_time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      const formattedTime = `${hour12}:${minutes} ${ampm}`;

      if (payload.action === 'confirm') {
        if (booking.status === 'confirmed') {
          return new Response(renderHTML('Already Confirmed', `This appointment for ${booking.client_name} on ${formattedDate} at ${formattedTime} has already been confirmed.`, 'info'), {
            headers: { ...corsHeaders, 'Content-Type': 'text/html' }
          });
        }

        if (booking.status === 'cancelled') {
          return new Response(renderHTML('Booking Cancelled', 'This booking has been cancelled and cannot be confirmed.', 'error'), {
            headers: { ...corsHeaders, 'Content-Type': 'text/html' }
          });
        }

        const isCouplesBooking = !!booking.practitioner_2_id;
        const serviceName = booking.services?.name || 'massage session';

        if (isCouplesBooking) {
          // Determine which practitioner is clicking this link
          // Since quick-action tokens don't carry user identity, we use practitioner assignment
          // The token was generated for a specific practitioner — we need to figure out which slot to fill
          const pract1Approved = !!booking.approved_by_practitioner_1;
          const pract2Approved = !!booking.approved_by_practitioner_2;

          if (pract1Approved && pract2Approved) {
            return new Response(renderHTML('Already Confirmed', `This couples massage for ${booking.client_name} has already been fully approved.`, 'info'), {
              headers: { ...corsHeaders, 'Content-Type': 'text/html' }
            });
          }

          // Fill the first empty slot
          const approvalUpdate: Record<string, any> = { updated_at: new Date().toISOString() };
          let filledSlot: 'practitioner_1' | 'practitioner_2';
          if (!pract1Approved) {
            approvalUpdate.approved_by_practitioner_1 = '00000000-0000-0000-0000-000000000001'; // Quick-action sentinel
            filledSlot = 'practitioner_1';
          } else {
            approvalUpdate.approved_by_practitioner_2 = '00000000-0000-0000-0000-000000000001';
            filledSlot = 'practitioner_2';
          }

          const bothNowApproved = (pract1Approved || filledSlot === 'practitioner_1') && (pract2Approved || filledSlot === 'practitioner_2');

          if (bothNowApproved) {
            // Both approved — trigger full approval flow via approve-booking
            approvalUpdate.status = 'confirmed';
            const { error: updateError } = await supabase
              .from('bookings')
              .update(approvalUpdate)
              .eq('id', payload.bookingId);

            if (updateError) {
              console.error('Error confirming couples booking:', updateError);
              return new Response(renderHTML('Error', 'Failed to confirm the booking. Please try again or log in to the dashboard.', 'error'), {
                headers: { ...corsHeaders, 'Content-Type': 'text/html' }
              });
            }

            // Trigger calendar sync + notifications
            try {
              await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', bookingId: payload.bookingId }),
              });
            } catch (e) { console.log('Calendar sync attempted:', e); }

            try {
              await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'booking_approved', bookingId: payload.bookingId, recipientType: 'client' }),
              });
            } catch (e) { console.log('Client notification attempted:', e); }

            return new Response(renderHTML(
              'Appointment Confirmed! ✓',
              `Both practitioners have approved! <strong>${booking.client_name}</strong>'s ${serviceName} on <strong>${formattedDate}</strong> at <strong>${formattedTime}</strong> is now confirmed.<br><br>The client has been notified automatically.`,
              'success'
            ), { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
          } else {
            // Partial approval
            const { error: updateError } = await supabase
              .from('bookings')
              .update(approvalUpdate)
              .eq('id', payload.bookingId);

            if (updateError) {
              console.error('Error recording partial approval:', updateError);
              return new Response(renderHTML('Error', 'Failed to record your approval. Please try again.', 'error'), {
                headers: { ...corsHeaders, 'Content-Type': 'text/html' }
              });
            }

            // Get remaining practitioner name
            const otherPractId = filledSlot === 'practitioner_1' ? booking.practitioner_2_id : booking.practitioner_id;
            const { data: otherPract } = await supabase.from('practitioners').select('name').eq('id', otherPractId).single();
            const awaitingName = otherPract?.name || 'the other practitioner';

            return new Response(renderHTML(
              'Approval Recorded ✓',
              `Your approval for <strong>${booking.client_name}</strong>'s ${serviceName} has been recorded.<br><br>Waiting for <strong>${awaitingName}</strong> to also approve before the appointment is fully confirmed.`,
              'info'
            ), { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
          }
        }

        // Standard single-practitioner confirm
        const { error: updateError } = await supabase
          .from('bookings')
          .update({ status: 'confirmed', updated_at: new Date().toISOString() })
          .eq('id', payload.bookingId);

        if (updateError) {
          console.error('Error confirming booking:', updateError);
          return new Response(renderHTML('Error', 'Failed to confirm the booking. Please try again or log in to the dashboard.', 'error'), {
            headers: { ...corsHeaders, 'Content-Type': 'text/html' }
          });
        }

        // Trigger calendar sync
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', bookingId: payload.bookingId }),
          });
        } catch (e) { console.log('Calendar sync attempted:', e); }

        // Send confirmation to client
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'booking_approved', bookingId: payload.bookingId, recipientType: 'client' }),
          });
        } catch (e) { console.log('Client notification attempted:', e); }

        return new Response(renderHTML(
          'Appointment Confirmed! ✓',
          `<strong>${booking.client_name}</strong>'s ${serviceName} on <strong>${formattedDate}</strong> at <strong>${formattedTime}</strong> has been confirmed.<br><br>The client has been notified automatically.`,
          'success'
        ), { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
      }

      if (payload.action === 'reschedule') {
        const dashboardUrl = `${BRAND.siteUrl}/calendar?reschedule=${payload.bookingId}`;
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, 'Location': dashboardUrl }
        });
      }

      return new Response(renderHTML('Unknown Action', 'This action is not recognized.', 'error'), {
        headers: { ...corsHeaders, 'Content-Type': 'text/html' }
      });
    }

    // Handle POST requests for generating action URLs (internal server-to-server use)
    if (req.method === 'POST') {
      const { bookingId, action } = await req.json();
      
      if (!bookingId || !action) {
        return new Response(
          JSON.stringify({ error: 'Missing bookingId or action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = await generateActionToken(bookingId, action);
      const actionUrl = `${SUPABASE_URL}/functions/v1/quick-action?token=${encodeURIComponent(token)}`;

      return new Response(
        JSON.stringify({ url: actionUrl, token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in quick-action:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

function renderHTML(title: string, message: string, type: 'success' | 'error' | 'info'): string {
  const colors = {
    success: { bg: '#dcfce7', border: '#22c55e', text: '#166534', icon: '✓' },
    error: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '✕' },
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: 'ℹ' }
  };
  const c = colors[type];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${BRAND.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667B68 0%, #4a5a4b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
      max-width: 480px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${c.bg};
      border: 3px solid ${c.border};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 36px;
      color: ${c.text};
    }
    h1 { color: ${c.text}; font-size: 24px; margin-bottom: 16px; }
    p { color: #4b5563; line-height: 1.6; font-size: 16px; }
    .logo { margin-top: 32px; color: #667B68; font-size: 14px; font-weight: 600; }
    a { color: #667B68; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; margin-top: 24px; padding: 12px 24px; background: #667B68; color: white; border-radius: 8px; text-decoration: none; font-weight: 500; }
    .btn:hover { background: #4a5a4b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${c.icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="${BRAND.siteUrl}/dashboard" class="btn">Go to Dashboard</a>
    <div class="logo">${BRAND.name}</div>
  </div>
</body>
</html>
  `;
}

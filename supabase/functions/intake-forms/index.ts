import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "https://esm.sh/resend@6.9.3";
import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ADMIN_EMAIL = BRAND.supportEmail;

const EMAIL_FOOTER_HTML = `
  <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
    <p style="margin: 4px 0;">${BRAND.name}</p>
    <p style="margin: 4px 0;">${BRAND.address}</p>
    <p style="margin: 4px 0;">${BRAND.supportEmail}</p>
  </div>
`;

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log('Resend not configured, skipping email');
    return false;
  }
  try {
    const resend = new Resend(RESEND_API_KEY);
    const htmlWithFooter = html + EMAIL_FOOTER_HTML;
    const { error } = await resend.emails.send({
      from: BRAND.fromSupport,
      to: [to],
      subject,
      html: htmlWithFooter,
    });
    if (error) { console.error('Email failed:', error); return false; }
    console.log('Email sent to:', to);
    return true;
  } catch (err) {
    console.error('Email error:', err);
    return false;
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // GET /intake-forms - List templates
    if (req.method === 'GET' && !path) {
      const { data, error } = await supabase
        .from('intake_form_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at');

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /intake-forms/:id - Get single template
    if (req.method === 'GET' && path) {
      const { data, error } = await supabase
        .from('intake_form_templates')
        .select('*')
        .eq('id', path)
        .single();

      if (error) throw error;

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /intake-forms - Submit a form response
    if (req.method === 'POST') {
      const body = await req.json();
      const { template_id, booking_id, client_email, client_name, responses, signature_data } = body;

      // Validate required fields
      if (!template_id || !client_email || !client_name) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: template_id, client_email, client_name' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get client IP for audit
      const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                         req.headers.get('x-real-ip') || 
                         'unknown';

      // Insert the response
      const { data, error } = await supabase
        .from('intake_form_responses')
        .insert({
          template_id,
          booking_id: booking_id || null,
          client_email,
          client_name,
          responses: responses || {},
          signature_data: signature_data || null,
          signed_at: signature_data ? new Date().toISOString() : null,
          ip_address,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      await debugLog(supabase, "intake-forms:intake_form_responses.insert", "Intake form response saved", { id: data.id, template_id, booking_id: booking_id || null });

      // Notify practitioner (and admin) that a health waiver was submitted
      if (booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('booking_date, start_time, practitioners:practitioner_id (name, email), practitioner2:practitioner_2_id (id, name, email), practitioner_id')
          .eq('id', booking_id)
          .single();

        if (booking) {
          const [yyyy, mm, dd] = booking.booking_date.split('-').map(Number);
          const formattedDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          });

          const emailHtml = `
            <h2>Health Waiver Submitted</h2>
            <p><strong>${client_name}</strong> has submitted their health intake form for their upcoming appointment.</p>
            <ul>
              <li><strong>Client:</strong> ${client_name}</li>
              <li><strong>Email:</strong> ${client_email}</li>
              <li><strong>Appointment Date:</strong> ${formattedDate}</li>
              <li><strong>Time:</strong> ${booking.start_time}</li>
            </ul>
            <p>You can review their intake form responses in the staff dashboard.</p>
          `;

          const emailsSentTo = new Set<string>();

          const rawPractitioner = (booking as any).practitioners;
          const practitioner = (Array.isArray(rawPractitioner) ? rawPractitioner[0] : rawPractitioner) as { name: string; email: string } | null;
          const rawPractitioner2 = (booking as any).practitioner2;
          const practitioner2 = (Array.isArray(rawPractitioner2) ? rawPractitioner2[0] : rawPractitioner2) as { id: string; name: string; email: string } | null;

          if (practitioner?.email) {
            await sendEmail(practitioner.email, `Health Waiver Submitted – ${client_name} on ${formattedDate}`, emailHtml);
            emailsSentTo.add(practitioner.email.toLowerCase());
          }

          if (practitioner2?.email && !emailsSentTo.has(practitioner2.email.toLowerCase())) {
            await sendEmail(practitioner2.email, `Health Waiver Submitted – ${client_name} on ${formattedDate}`, emailHtml);
            emailsSentTo.add(practitioner2.email.toLowerCase());
          }

          if (!emailsSentTo.has(ADMIN_EMAIL.toLowerCase())) {
            await sendEmail(ADMIN_EMAIL, `Health Waiver Submitted – ${client_name} on ${formattedDate}`, emailHtml);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, response_id: data.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Intake forms error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

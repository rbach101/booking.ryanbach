import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DAILY-REPORT] ${step}${detailsStr}`);
};

const formatCurrency = (amount: number | null) => {
  return `$${(amount || 0).toFixed(2)}`;
};

const formatTime12h = (time24: string) => {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Health check fast path — don't send actual report
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const body = await req.clone().json();
        if (body?.healthCheck) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {}
    }

    logStep("Function started");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get today's date in HST (UTC-10)
    const now = new Date();
    const hstOffset = -10 * 60 * 60 * 1000;
    const hstNow = new Date(now.getTime() + hstOffset + now.getTimezoneOffset() * 60 * 1000);
    const today = `${hstNow.getFullYear()}-${String(hstNow.getMonth() + 1).padStart(2, '0')}-${String(hstNow.getDate()).padStart(2, '0')}`;

    logStep("Querying bookings for date", { today });

    // Fetch all bookings for today (not cancelled)
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select(`
        id, client_name, client_email, booking_date, start_time, end_time,
        status, total_amount, deposit_paid, balance_paid, balance_due,
        practitioner_id, practitioner_2_id, service_id, notes
      `)
      .eq("booking_date", today)
      .neq("status", "cancelled");

    if (bookingsError) throw new Error(`Bookings query failed: ${bookingsError.message}`);

    logStep("Bookings found", { count: bookings?.length || 0 });

    if (!bookings || bookings.length === 0) {
      // Send a "no appointments" email
      await sendEmail(Deno.env.get("RESEND_API_KEY") || "", today, "<p>No appointments were scheduled for today.</p>");
      return new Response(JSON.stringify({ sent: true, bookings: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch practitioners
    const { data: practitioners } = await supabase
      .from("practitioners")
      .select("id, name");
    const practMap = new Map((practitioners || []).map(p => [p.id, p.name]));

    // Fetch services
    const { data: services } = await supabase
      .from("services")
      .select("id, name, price, duration");
    const serviceMap = new Map((services || []).map(s => [s.id, s]));

    // Fetch all payments for today's bookings
    const bookingIds = bookings.map(b => b.id);
    const { data: payments } = await supabase
      .from("booking_payments")
      .select("booking_id, type, amount, status, paid_at")
      .in("booking_id", bookingIds);

    // Group payments by booking
    const paymentsByBooking = new Map<string, any[]>();
    for (const p of payments || []) {
      const arr = paymentsByBooking.get(p.booking_id) || [];
      arr.push(p);
      paymentsByBooking.set(p.booking_id, arr);
    }

    // Group bookings by practitioner
    const practitionerBookings = new Map<string, any[]>();
    for (const b of bookings) {
      // Add to primary practitioner
      if (b.practitioner_id) {
        const arr = practitionerBookings.get(b.practitioner_id) || [];
        arr.push({ ...b, role: 'primary' });
        practitionerBookings.set(b.practitioner_id, arr);
      }
      // Add to secondary practitioner (couples)
      if (b.practitioner_2_id) {
        const arr = practitionerBookings.get(b.practitioner_2_id) || [];
        arr.push({ ...b, role: 'secondary' });
        practitionerBookings.set(b.practitioner_2_id, arr);
      }
    }

    // Build HTML report
    let totalRevenue = 0;
    let totalTips = 0;
    let totalAppointments = 0;
    let practitionerSections = '';

    for (const [practId, pBookings] of practitionerBookings) {
      const practName = practMap.get(practId) || 'Unknown';
      let practRevenue = 0;
      let practTips = 0;

      let rows = '';
      for (const b of pBookings) {
        const svc = serviceMap.get(b.service_id);
        const svcName = svc?.name || 'N/A';
        const svcPrice = svc?.price || 0;
        const bPayments = paymentsByBooking.get(b.id) || [];

        const depositPayment = bPayments.find((p: any) => p.type === 'deposit');
        const balancePayment = bPayments.find((p: any) => p.type === 'balance');
        const tipPayments = bPayments.filter((p: any) => p.type === 'tip');
        const tipTotal = tipPayments.reduce((sum: number, p: any) => sum + (p.status === 'paid' ? Number(p.amount) : 0), 0);
        const tipPending = tipPayments.reduce((sum: number, p: any) => sum + (p.status === 'pending' ? Number(p.amount) : 0), 0);

        const depositStatus = depositPayment
          ? (depositPayment.status === 'paid' ? '✅ Paid' : `⏳ ${depositPayment.status}`)
          : '—';
        const balanceStatus = balancePayment
          ? (balancePayment.status === 'paid' ? '✅ Paid' : `⏳ ${balancePayment.status}`)
          : (b.balance_paid ? '✅ Paid' : '—');

        const serviceRevenue = b.role === 'secondary' ? svcPrice / 2 : svcPrice;
        practRevenue += serviceRevenue;
        practTips += tipTotal;

        const couplesTag = b.practitioner_2_id ? ' 👥' : '';
        const roleTag = b.role === 'secondary' ? ' <em>(2nd therapist)</em>' : '';

        rows += `
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <td style="padding: 8px; font-size: 14px;">${formatTime12h(b.start_time)} – ${formatTime12h(b.end_time)}</td>
            <td style="padding: 8px; font-size: 14px;">${b.client_name}</td>
            <td style="padding: 8px; font-size: 14px;">${svcName}${couplesTag}${roleTag}</td>
            <td style="padding: 8px; font-size: 14px;">${formatCurrency(serviceRevenue)}</td>
            <td style="padding: 8px; font-size: 14px;">${depositStatus}</td>
            <td style="padding: 8px; font-size: 14px;">${balanceStatus}</td>
            <td style="padding: 8px; font-size: 14px;">${tipTotal > 0 ? `✅ ${formatCurrency(tipTotal)}` : tipPending > 0 ? `⏳ ${formatCurrency(tipPending)}` : '—'}</td>
            <td style="padding: 8px; font-size: 14px;">${b.status}</td>
          </tr>`;
        totalAppointments++;
      }

      totalRevenue += practRevenue;
      totalTips += practTips;

      practitionerSections += `
        <div style="margin-bottom: 32px;">
          <h2 style="color: #2d5016; margin-bottom: 4px; font-size: 18px;">${practName}</h2>
          <p style="color: #666; font-size: 13px; margin: 0 0 12px;">
            ${pBookings.length} appointment${pBookings.length > 1 ? 's' : ''} · 
            Service Revenue: <strong>${formatCurrency(practRevenue)}</strong> · 
            Tips: <strong>${formatCurrency(practTips)}</strong>
          </p>
          <table style="width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden;">
            <thead>
              <tr style="background: #f3f4f0;">
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Time</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Client</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Service</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Price</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Deposit</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Balance</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Tip</th>
                <th style="padding: 8px; text-align: left; font-size: 12px; color: #666; text-transform: uppercase;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    // Format date nicely
    const dateObj = new Date(today + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; background: #fafaf8;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #1a1a1a; margin: 0; font-size: 24px;">Daily Practitioner Report</h1>
          <p style="color: #666; margin: 4px 0 0; font-size: 15px;">${formattedDate} · ${BRAND.name}</p>
        </div>

        <div style="display: flex; gap: 16px; margin-bottom: 24px; text-align: center;">
          <div style="flex: 1; background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #e5e5e5;">
            <div style="font-size: 24px; font-weight: bold; color: #2d5016;">${totalAppointments}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Appointments</div>
          </div>
          <div style="flex: 1; background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #e5e5e5;">
            <div style="font-size: 24px; font-weight: bold; color: #2d5016;">${formatCurrency(totalRevenue)}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Service Revenue</div>
          </div>
          <div style="flex: 1; background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #e5e5e5;">
            <div style="font-size: 24px; font-weight: bold; color: #2d5016;">${formatCurrency(totalTips)}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Tips Collected</div>
          </div>
          <div style="flex: 1; background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #e5e5e5;">
            <div style="font-size: 24px; font-weight: bold; color: #2d5016;">${formatCurrency(totalRevenue + totalTips)}</div>
            <div style="font-size: 12px; color: #888; text-transform: uppercase;">Total</div>
          </div>
        </div>

        ${practitionerSections}

        <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e5e5;">
          <p style="color: #999; font-size: 12px;">This report was auto-generated at 6:30 PM HST</p>
        </div>
      </div>
    `;

    await sendEmail(Deno.env.get("RESEND_API_KEY") || "", today, html);

    logStep("Report sent successfully", { totalAppointments, totalRevenue, totalTips });

    return new Response(JSON.stringify({
      sent: true,
      date: today,
      totalAppointments,
      totalRevenue,
      totalTips,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function sendEmail(resendApiKey: string, date: string, bodyHtml: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: BRAND.fromSupport,
      to: ["aleabackus@gmail.com"],
      subject: `Daily Practitioner Report – ${date}`,
      html: bodyHtml,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend failed: ${errText}`);
  }
}

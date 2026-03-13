import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { BRAND } from "../_shared/brand.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkCalendarBusyConflict } from "../_shared/calendar.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";

function toHHMM(t: string): string {
  const raw = (t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Roles error:', rolesError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify user role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userRoles = roles?.map(r => r.role) || [];
    const isAuthorized = userRoles.includes('admin') || userRoles.includes('staff');

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions. Admin or staff role required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const {
      customerId,
      clientName,
      clientEmail,
      clientPhone,
      practitionerId,
      practitioner2Id,
      roomId,
      serviceId,
      bookingDate,
      startTime,
      endTime,
      notes,
      totalAmount,
      balanceDue,
      depositPaid = false,
      status = 'pending_approval',
      requiresApproval = true,
      isInsuranceBooking,
    } = await req.json();

    // If customerId is provided, fetch customer details
    let finalClientName = clientName;
    let finalClientEmail = clientEmail;
    let finalClientPhone = clientPhone;

    if (customerId) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('first_name, last_name, email, phone')
        .eq('id', customerId)
        .single();

      if (customerError || !customer) {
        return new Response(
          JSON.stringify({ error: 'Customer not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      finalClientName = `${customer.first_name} ${customer.last_name}`;
      finalClientEmail = customer.email;
      finalClientPhone = customer.phone;
    }

    if (!customerId && (!finalClientName || !finalClientEmail)) {
      return new Response(
        JSON.stringify({ error: 'Either customerId or clientName/clientEmail is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bookingDate || !startTime || !endTime) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bookingDate, startTime, endTime' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const startHHMM = toHHMM(startTime);
    const endHHMM = toHHMM(endTime);
    if (!startHHMM || !endHHMM) {
      return new Response(
        JSON.stringify({ error: 'Invalid time format. Please use HH:MM.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalClientEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== REQUIRE PRACTITIONER ==========
    if (!practitionerId) {
      return new Response(
        JSON.stringify({ error: 'A practitioner must be selected when creating an appointment.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DOUBLE PREVENTION: Check internal booking conflicts ==========
    // Check practitioner conflicts
    if (practitionerId) {
      const { data: practitionerConflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled')
        .lt('start_time', endHHMM)
        .gt('end_time', startHHMM)
        .or(`practitioner_id.eq.${practitionerId},practitioner_2_id.eq.${practitionerId}`);

      console.log('[CREATE-APPT-CONFLICT] practitioner_conflicts', {
        practitionerId,
        bookingDate,
        startTime: startHHMM,
        endTime: endHHMM,
        conflictCount: practitionerConflicts ? practitionerConflicts.length : 0,
      });

      if (practitionerConflicts && practitionerConflicts.length > 0) {
        console.log('[CREATE-APPT-DECISION] blocked_internal_practitioner_conflict', {
          practitionerId,
          bookingDate,
          startTime: startHHMM,
          endTime: endHHMM,
        });
        return new Response(
          JSON.stringify({ error: 'Practitioner is already booked during this time' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check 2nd practitioner conflicts (couples massage)
    if (practitioner2Id) {
      const { data: pract2Conflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled')
        .lt('start_time', endHHMM)
        .gt('end_time', startHHMM)
        .or(`practitioner_id.eq.${practitioner2Id},practitioner_2_id.eq.${practitioner2Id}`);

      console.log('[CREATE-APPT-CONFLICT] practitioner2_conflicts', {
        practitioner2Id,
        bookingDate,
        startTime,
        endTime,
        conflictCount: pract2Conflicts ? pract2Conflicts.length : 0,
      });

      if (pract2Conflicts && pract2Conflicts.length > 0) {
        return new Response(
          JSON.stringify({ error: 'Second practitioner is already booked during this time' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check room conflicts
    if (roomId) {
      const { data: roomConflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .eq('room_id', roomId)
        .neq('status', 'cancelled')
        .lt('start_time', endHHMM)
        .gt('end_time', startHHMM);

      console.log('[CREATE-APPT-CONFLICT] room_conflicts', {
        roomId,
        bookingDate,
        startTime,
        endTime,
        conflictCount: roomConflicts ? roomConflicts.length : 0,
      });

      if (roomConflicts && roomConflicts.length > 0) {
        return new Response(
          JSON.stringify({ error: 'Room is already booked during this time' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== DOUBLE PREVENTION: Check Google Calendar busy conflicts ==========
    if (practitionerId) {
      const { data: practData } = await supabase
        .from('practitioners')
        .select('name')
        .eq('id', practitionerId)
        .single();
      const practName = practData?.name || 'Practitioner';

      const calendarCheck = await checkCalendarBusyConflict(supabase, practitionerId, bookingDate, startHHMM, endHHMM, "[CREATE-APPT]");

      console.log('[CREATE-APPT-CONFLICT] practitioner_google_calendar', {
        practitionerId,
        bookingDate,
        startTime,
        endTime,
        hasConflict: calendarCheck.hasConflict,
        reason: calendarCheck.reason,
        summary: calendarCheck.summary || null,
      });

      if (calendarCheck.hasConflict) {
        console.log(`[CREATE-APPT] BLOCKED: ${practName} has calendar conflict on ${bookingDate} ${startTime}-${endTime}: ${calendarCheck.summary}`);
        return new Response(
          JSON.stringify({ 
            error: `${practName} has a Google Calendar block during this time (${calendarCheck.summary}). Please choose a different time.` 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (practitioner2Id) {
      const { data: pract2Data } = await supabase
        .from('practitioners')
        .select('name')
        .eq('id', practitioner2Id)
        .single();
      const pract2Name = pract2Data?.name || 'Second Practitioner';

      const calendarCheck2 = await checkCalendarBusyConflict(supabase, practitioner2Id, bookingDate, startHHMM, endHHMM, "[CREATE-APPT]");

      console.log('[CREATE-APPT-CONFLICT] practitioner2_google_calendar', {
        practitioner2Id,
        bookingDate,
        startTime,
        endTime,
        hasConflict: calendarCheck2.hasConflict,
        reason: calendarCheck2.reason,
        summary: calendarCheck2.summary || null,
      });

      if (calendarCheck2.hasConflict) {
        console.log(`[CREATE-APPT] BLOCKED: ${pract2Name} has calendar conflict on ${bookingDate} ${startTime}-${endTime}: ${calendarCheck2.summary}`);
        return new Response(
          JSON.stringify({ 
            error: `${pract2Name} has a Google Calendar block during this time (${calendarCheck2.summary}). Please choose a different time.` 
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== SCHEDULE VALIDATION: Check availability_blocks ==========
    const bookingDateObj = new Date(bookingDate + 'T12:00:00');
    const dayOfWeek = bookingDateObj.getDay(); // 0=Sunday ... 6=Saturday
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Check primary practitioner schedule
    {
      const { data: availBlocks } = await supabase
        .from('availability_blocks')
        .select('start_time, end_time')
        .eq('practitioner_id', practitionerId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_available', true);

      const { data: practScheduleData } = await supabase
        .from('practitioners')
        .select('name')
        .eq('id', practitionerId)
        .single();
      const schedPractName = practScheduleData?.name || 'Practitioner';

      console.log('[CREATE-APPT-CONFLICT] practitioner_availability_blocks', {
        practitionerId,
        bookingDate,
        startTime,
        endTime,
        dayOfWeek,
        availBlockCount: availBlocks ? availBlocks.length : 0,
      });

      if (!availBlocks || availBlocks.length === 0) {
        console.log(`[CREATE-APPT] BLOCKED: ${schedPractName} has no availability on ${dayNames[dayOfWeek]} (day ${dayOfWeek})`);
        return new Response(
          JSON.stringify({ error: `${schedPractName} is not scheduled to work on ${dayNames[dayOfWeek]}s. Please select a different practitioner or time.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const coversTime = availBlocks.some((block: any) => {
        const blockStart = block.start_time.substring(0, 5);
        const blockEnd = block.end_time.substring(0, 5);
        return startHHMM >= blockStart && endHHMM <= blockEnd;
      });

      if (!coversTime) {
        console.log(`[CREATE-APPT] BLOCKED: ${schedPractName} schedule on ${dayNames[dayOfWeek]} doesn't cover ${startTime}-${endTime}`);
        return new Response(
          JSON.stringify({ error: `${schedPractName}'s schedule on ${dayNames[dayOfWeek]}s doesn't cover ${startTime}-${endTime}. Please select a different time.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check 2nd practitioner schedule (couples massage)
    if (practitioner2Id) {
      const { data: avail2Blocks } = await supabase
        .from('availability_blocks')
        .select('start_time, end_time')
        .eq('practitioner_id', practitioner2Id)
        .eq('day_of_week', dayOfWeek)
        .eq('is_available', true);

      const { data: pract2SchedData } = await supabase
        .from('practitioners')
        .select('name')
        .eq('id', practitioner2Id)
        .single();
      const pract2SchedName = pract2SchedData?.name || 'Second Practitioner';

      if (!avail2Blocks || avail2Blocks.length === 0) {
        return new Response(
          JSON.stringify({ error: `${pract2SchedName} is not scheduled to work on ${dayNames[dayOfWeek]}s. Please select a different practitioner or time.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const covers2 = avail2Blocks.some((block: any) => {
        const blockStart = block.start_time.substring(0, 5);
        const blockEnd = block.end_time.substring(0, 5);
        return startHHMM >= blockStart && endHHMM <= blockEnd;
      });

      if (!covers2) {
        return new Response(
          JSON.stringify({ error: `${pract2SchedName}'s schedule on ${dayNames[dayOfWeek]}s doesn't cover ${startTime}-${endTime}. Please select a different time.` }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========== DERIVE INSURANCE FROM SERVICE IF NOT PROVIDED ==========
    let isInsurance = isInsuranceBooking === true;
    if (!isInsurance && serviceId) {
      const { data: svcCat } = await supabase
        .from('services')
        .select('category')
        .eq('id', serviceId)
        .single();
      if (svcCat?.category === 'insurance') {
        isInsurance = true;
        console.log('[CREATE-APPT] Auto-detected insurance from service category');
      }
    }

    // For insurance: no deposit, no balance due
    const finalTotalAmount = isInsurance ? 0 : (totalAmount ?? null);
    const finalBalanceDue = isInsurance ? 0 : (balanceDue !== undefined ? balanceDue : totalAmount ?? null);

    // ========== PRACTITIONER-SERVICE MAPPING VALIDATION ==========
    // Validate before insert so we can return a clear error (DB trigger also enforces this)
    if (serviceId && practitionerId) {
      const { data: svc } = await supabase
        .from('services')
        .select('name, practitioner_ids')
        .eq('id', serviceId)
        .single();

      if (svc?.practitioner_ids && svc.practitioner_ids.length > 0) {
        if (!svc.practitioner_ids.includes(practitionerId)) {
          const { data: pract } = await supabase
            .from('practitioners')
            .select('name')
            .eq('id', practitionerId)
            .single();
          const practName = pract?.name || 'Selected practitioner';
          const serviceName = svc.name || 'this service';
          return new Response(
            JSON.stringify({
              error: `${practName} is not assigned to ${serviceName}. Please go to Services & Extras, edit "${serviceName}", and add ${practName} to the practitioner list.`,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (practitioner2Id && svc?.practitioner_ids && svc.practitioner_ids.length > 0) {
        if (!svc.practitioner_ids.includes(practitioner2Id)) {
          const { data: pract2 } = await supabase
            .from('practitioners')
            .select('name')
            .eq('id', practitioner2Id)
            .single();
          const pract2Name = pract2?.name || 'Second practitioner';
          const serviceName = svc.name || 'this service';
          return new Response(
            JSON.stringify({
              error: `${pract2Name} is not assigned to ${serviceName}. Please go to Services & Extras, edit "${serviceName}", and add ${pract2Name} to the practitioner list.`,
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    console.log('[CREATE-APPT] All conflict checks passed. Creating appointment for:', finalClientName, 'on', bookingDate, 'at', startHHMM);


    // Create the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        customer_id: customerId || null,
        client_name: finalClientName,
        client_email: finalClientEmail,
        client_phone: finalClientPhone || null,
        practitioner_id: practitionerId || null,
        practitioner_2_id: practitioner2Id || null,
        room_id: roomId || null,
        service_id: serviceId || null,
        booking_date: bookingDate,
        start_time: startHHMM,
        end_time: endHHMM,
        notes: notes || null,
        total_amount: finalTotalAmount,
        balance_due: finalBalanceDue,
        deposit_paid: isInsurance ? true : depositPaid,
        status: status,
        is_insurance_booking: isInsurance,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('[CREATE-APPT] Booking creation error:', bookingError);
      if (bookingError.code === '23505' || bookingError.message?.includes('already booked')) {
        return new Response(
          JSON.stringify({ error: 'This time slot is no longer available. Another booking exists for this time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Handle practitioner-service mapping validation
      if (bookingError.code === '23514' || bookingError.message?.includes('not authorized to perform')) {
        return new Response(
          JSON.stringify({ error: bookingError.message }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to create booking', details: bookingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CREATE-APPT] Booking created successfully:', booking.id);
    await debugLog(supabase, "create-appointment:bookings.insert", "Booking created (admin)", { booking_id: booking.id, booking_date: bookingDate, start_time: startHHMM });

    // Send approval request notification to practitioner if status is pending_approval
    if (booking.status === 'pending_approval' && practitionerId) {
      try {
        const notifResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'approval_request',
            bookingId: booking.id,
            recipientType: 'practitioner'
          }),
        });

        if (!notifResponse.ok) {
          console.error('[CREATE-APPT] Notification failed but booking was created');
        }
      } catch (notifError) {
        console.error('[CREATE-APPT] Notification error (non-blocking):', notifError);
      }
    }

    // Send confirmation notifications when status is 'confirmed' (auto-approved)
    if (booking.status === 'confirmed') {
      let clientNotifSuccess = false;
      let staffNotifSuccess = false;

      // 1) Send client confirmation
      try {
        const clientNotifResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'booking_confirmation',
            bookingId: booking.id,
            recipientType: 'client',
          }),
        });

        if (clientNotifResponse.ok) {
          clientNotifSuccess = true;
          console.log('[CREATE-APPT] Client confirmation notification sent for booking:', booking.id);
        } else {
          console.error('[CREATE-APPT] Client send-notification failed:', await clientNotifResponse.text());
        }
      } catch (notifError) {
        console.error('[CREATE-APPT] Client notification error (non-blocking):', notifError);
      }

      // 2) Always send separate practitioner notification for auto-approved bookings
      try {
        await new Promise(r => setTimeout(r, 1100)); // Resend rate limit
        const staffNotifResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'booking_confirmation',
            bookingId: booking.id,
            recipientType: 'staff',
          }),
        });

        if (staffNotifResponse.ok) {
          staffNotifSuccess = true;
          console.log('[CREATE-APPT] Staff confirmation notification sent for booking:', booking.id);
        } else {
          console.error('[CREATE-APPT] Staff send-notification failed:', await staffNotifResponse.text());
        }
      } catch (notifError) {
        console.error('[CREATE-APPT] Staff notification error (non-blocking):', notifError);
      }

      // FALLBACK: If staff notification failed, send direct practitioner emails
      if (!staffNotifSuccess) {
        console.log('[CREATE-APPT] send-notification failed — sending direct staff emails as fallback');
        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        if (RESEND_API_KEY) {
          try {
            const { Resend } = await import("https://esm.sh/resend@6.9.3");
            const resend = new Resend(RESEND_API_KEY);

            // Get service name
            let serviceName = 'Appointment';
            if (serviceId) {
              const { data: svc } = await supabase.from('services').select('name').eq('id', serviceId).single();
              if (svc?.name) serviceName = svc.name;
            }

            let displayDate = bookingDate;
            try {
              const [yyyy, mm, dd] = bookingDate.split('-').map(Number);
              displayDate = new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              });
            } catch { /* use raw */ }

            const staffHtml = `
              <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #faf9f6;">
                <h1 style="color: #6b8f71; font-size: 24px;">Appointment Confirmed</h1>
                <p>A new appointment has been confirmed on your schedule:</p>
                <ul>
                  <li><strong>Client:</strong> ${finalClientName}</li>
                  <li><strong>Email:</strong> ${finalClientEmail}</li>
                  <li><strong>Phone:</strong> ${finalClientPhone || 'Not provided'}</li>
                  <li><strong>Service:</strong> ${serviceName}</li>
                  <li><strong>Date:</strong> ${displayDate}</li>
                  <li><strong>Time:</strong> ${startTime} - ${endTime}</li>
                  ${notes ? `<li><strong>Notes:</strong> ${notes}</li>` : ''}
                </ul>
                <p><a href="${BRAND.siteUrl}/calendar" style="display:inline-block;padding:12px 24px;background-color:#6b8f71;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">View Calendar</a></p>
                <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
                  <p style="margin: 4px 0;">${BRAND.name}</p>
                  <p style="margin: 4px 0;">${BRAND.address}</p>
                </div>
              </div>`;
            const staffText = `Appointment Confirmed\n\nClient: ${finalClientName}\nService: ${serviceName}\nDate: ${displayDate}\nTime: ${startTime} - ${endTime}\n\n${BRAND.name}`;
            const staffSubject = `Appointment Confirmed – ${finalClientName} on ${displayDate}`;

            const practitionerIds = [practitionerId, practitioner2Id].filter(Boolean);
            for (const pId of practitionerIds) {
              const { data: pract } = await supabase.from('practitioners').select('email').eq('id', pId).single();
              if (pract?.email) {
                await new Promise(r => setTimeout(r, 1100));
                await resend.emails.send({
                  from: BRAND.fromSupport,
                  to: [pract.email],
                  subject: staffSubject,
                  html: staffHtml,
                  text: staffText,
                });
                console.log('[CREATE-APPT] Direct fallback staff email sent to:', pract.email);
              }
            }
          } catch (fallbackErr) {
            console.error('[CREATE-APPT] Direct fallback staff email failed:', fallbackErr);
          }
        }
      }
    }

    // Sync with Google Calendar only if booking is confirmed
    if (booking.status === 'confirmed') {
      try {
        const { data: connections } = await supabase
          .from('calendar_connections')
          .select('id')
          .eq('is_connected', true)
          .limit(1);

        if (connections && connections.length > 0) {
          const syncResponse = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'create-event',
              bookingId: booking.id,
            }),
          });

          if (!syncResponse.ok) {
            console.error('[CREATE-APPT] Calendar sync failed but booking was created');
          }
        }
      } catch (syncError) {
        console.error('[CREATE-APPT] Calendar sync error (non-blocking):', syncError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking: {
          id: booking.id,
          clientName: booking.client_name,
          clientEmail: booking.client_email,
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          endTime: booking.end_time,
          status: booking.status,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CREATE-APPT] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

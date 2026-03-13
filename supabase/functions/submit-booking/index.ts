import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@6.9.3";
import { checkCalendarBusyConflict } from "../_shared/calendar.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";
import { debugLog } from "../_shared/debugLog.ts";
import { generateDepositToken } from "../_shared/deposit-token.ts";
import { logStructured } from "../_shared/logger.ts";

console.log('[SUBMIT-BOOT] module_loaded', {
  hasSupabaseUrl: Boolean(Deno.env.get('SUPABASE_URL')),
  hasServiceRoleKey: Boolean(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')),
  hasTokenEncryptionKey: Boolean(Deno.env.get('TOKEN_ENCRYPTION_KEY')),
  hasGoogleClientId: Boolean(Deno.env.get('GOOGLE_CLIENT_ID')),
  hasGoogleClientSecret: Boolean(Deno.env.get('GOOGLE_CLIENT_SECRET')),
  hasResendApiKey: Boolean(Deno.env.get('RESEND_API_KEY')),
});

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// 30-minute buffer after outcall appointments for travel time
const OUTCALL_BUFFER_MINUTES = 30;

function toHHMM(t: string): string {
  // DB `time` often serializes as HH:MM:SS; UI sometimes sends H:MM.
  // Normalize to strict, zero-padded HH:MM for reliable comparisons.
  const raw = (t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return '';
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

interface BookingRequest {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  practitionerId?: string | null;
  practitioner2Id?: string | null;
  roomId?: string | null;
  serviceId?: string | null;
  serviceName?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  notes?: string;
  totalAmount?: number;
  extras?: string[];
  isOutcall?: boolean;
  location?: string;
  isInsuranceBooking?: boolean;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceGroupNumber?: string;
  insuranceMemberId?: string;
  insuranceSubscriberName?: string;
  insuranceSubscriberDob?: string;
  consentEmail?: boolean;
  consentSms?: boolean;
}

// SMS via Klaviyo (replaces Vonage — Klaviyo handles SMS delivery via flows)
async function sendSMSViaKlaviyo(to: string, clientName: string, clientEmail: string): Promise<boolean> {
  const KLAVIYO_API_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
  if (!KLAVIYO_API_KEY) {
    console.log('Klaviyo not configured, skipping SMS subscription');
    return false;
  }

  try {
    let cleanTo = to.replace(/[^\d+]/g, '');
    if (!cleanTo.startsWith('+')) {
      if (cleanTo.length === 10) cleanTo = '+1' + cleanTo;
      else cleanTo = '+' + cleanTo;
    }

    // Subscribe to Klaviyo SMS list — Klaviyo handles delivery via flows
    const response = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'Content-Type': 'application/json',
        'revision': '2024-02-15',
      },
      body: JSON.stringify({
        data: {
          type: 'profile-subscription-bulk-create-job',
          attributes: {
            profiles: {
              data: [{
                type: 'profile',
                attributes: {
                  email: clientEmail,
                  phone_number: cleanTo,
                  properties: { first_name: clientName.split(' ')[0] },
                },
              }],
            },
            historical_import: false,
          },
          relationships: {
            list: {
              data: { type: 'list', id: Deno.env.get('KLAVIYO_SMS_LIST_ID') || 'XpKNfH' },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Klaviyo SMS subscription error:', errText);
      return false;
    }

    console.log('Client subscribed to Klaviyo SMS list:', clientEmail);
    return true;
  } catch (error) {
    console.error('Klaviyo SMS error:', error);
    return false;
  }
}

// BUG-01: Simple in-memory rate limiter (per edge function instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 bookings per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function buildClientConfirmationEmail(
  clientName: string, service: string, date: string, time: string,
  practitioner: string, intakeSection: string
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
<tr><td style="background:linear-gradient(135deg,#667B68 0%,#4a5a4b 100%);padding:32px;text-align:center;border-radius:12px 12px 0 0;">
<h1 style="color:white;margin:0;font-size:24px;">Booking Received! ✨</h1>
</td></tr>
<tr><td style="padding:32px;">
<p style="color:#374151;font-size:16px;margin:0 0 8px;">Hi ${clientName},</p>
<p style="color:#374151;font-size:16px;margin:0 0 24px;">Thank you for booking with us! We've received your appointment request and will confirm it shortly.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;"><tr><td>
<table width="100%" cellpadding="8" cellspacing="0">
<tr><td style="color:#6b7280;font-size:14px;width:120px;">Service:</td><td style="color:#111827;font-size:14px;font-weight:600;">${service}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Date:</td><td style="color:#111827;font-size:14px;font-weight:600;">${date}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Time:</td><td style="color:#111827;font-size:14px;font-weight:600;">${time}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;">Practitioner:</td><td style="color:#111827;font-size:14px;font-weight:600;">${practitioner}</td></tr>
</table></td></tr></table>
</td></tr>
${intakeSection}
<tr><td style="padding:0 32px 24px;">
<p style="color:#6b7280;font-size:14px;margin:0;">If you have any questions, please contact us at <a href="mailto:${BRAND.supportEmail}" style="color:#667B68;">${BRAND.supportEmail}</a>.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:20px;text-align:center;border-radius:0 0 12px 12px;">
<p style="color:#667B68;font-size:14px;margin:0;font-weight:600;">${BRAND.name}</p>
<p style="color:#9ca3af;font-size:12px;margin:4px 0 0;">${BRAND.address}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[SUBMIT-BOOT] handler_enter', {
    method: req.method,
    hasOrigin: Boolean(req.headers.get('origin')),
    hasAuth: Boolean(req.headers.get('authorization')),
  });

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    // BUG-01: Rate limit check
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('cf-connecting-ip') || 'unknown';
    if (!checkRateLimit(clientIp)) {
      console.log(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: 'Too many booking requests. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      clientName,
      clientEmail,
      clientPhone,
      practitionerId,
      practitioner2Id,
      roomId,
      serviceId,
      serviceName,
      bookingDate,
      startTime,
      endTime,
      notes,
      totalAmount,
      extras,
      isOutcall,
      location,
      // Insurance fields
      isInsuranceBooking,
      insuranceProvider,
      insurancePolicyNumber,
      insuranceGroupNumber,
      insuranceMemberId,
      insuranceSubscriberName,
      insuranceSubscriberDob,
      consentEmail,
      consentSms,
    }: BookingRequest = await req.json();

    // Calculate buffered end time for outcall services
    let bufferedEndTime = endTime;
    if (isOutcall) {
      const [endHours, endMins] = endTime.split(':').map(Number);
      const totalEndMinutes = endHours * 60 + endMins + OUTCALL_BUFFER_MINUTES;
      const newEndHours = Math.floor(totalEndMinutes / 60);
      const newEndMins = totalEndMinutes % 60;
      bufferedEndTime = `${newEndHours.toString().padStart(2, '0')}:${newEndMins.toString().padStart(2, '0')}`;
      console.log(`Outcall service: adding ${OUTCALL_BUFFER_MINUTES}min buffer. End time: ${endTime} -> ${bufferedEndTime}`);
    }

    const startHHMM = toHHMM(startTime);
    const endHHMM = toHHMM(endTime);
    const bufferedEndHHMM = toHHMM(bufferedEndTime);

    if (!startHHMM || !endHHMM || !bufferedEndHHMM) {
      return new Response(
        JSON.stringify({ error: 'Invalid time format. Please use HH:MM.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!clientName || !clientEmail || !clientPhone) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: clientName, clientEmail, clientPhone' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!bookingDate || !startTime || !endTime) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: bookingDate, startTime, endTime' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // BUG-16: Validate booking date is not in the past (Hawaii time)
    {
      const now = new Date();
      const hawaiiOffset = -10 * 60;
      const localOffset = now.getTimezoneOffset();
      const hawaiiTime = new Date(now.getTime() + (localOffset - hawaiiOffset) * 60 * 1000);
      const todayHST = hawaiiTime.toISOString().split('T')[0];
      
      if (bookingDate < todayHST) {
        return new Response(
          JSON.stringify({ error: 'Cannot book appointments in the past.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate input lengths to prevent abuse
    if (clientName.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Client name too long (max 200 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (clientEmail.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Email too long (max 255 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (clientPhone.length > 20) {
      return new Response(
        JSON.stringify({ error: 'Phone number too long (max 20 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (notes && notes.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Notes too long (max 2000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate extras array
    if (extras) {
      if (!Array.isArray(extras) || extras.length > 10) {
        return new Response(
          JSON.stringify({ error: 'Too many extras selected (max 10)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      // Validate each extra is a reasonable string (service name)
      const validExtra = extras.every(e => typeof e === 'string' && e.length <= 100);
      if (!validExtra) {
        return new Response(
          JSON.stringify({ error: 'Invalid extra item format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientEmail)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone format (basic check for US numbers)
    const phoneDigits = clientPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating booking for:', clientName, 'on', bookingDate, 'at', startTime);

    // Look up actual service ID from database
    let resolvedServiceId = serviceId || null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    // If serviceId is not a valid UUID, look up by name
    if (!resolvedServiceId || !uuidRegex.test(resolvedServiceId)) {
      resolvedServiceId = null;
      if (serviceName) {
        // Try exact match first
        const { data: exactMatch } = await supabase
          .from('services')
          .select('id')
          .eq('name', serviceName)
          .limit(1)
          .maybeSingle();
        
        if (exactMatch) {
          resolvedServiceId = exactMatch.id;
        } else {
          // Try partial match
          const { data: fuzzyMatch } = await supabase
            .from('services')
            .select('id, name')
            .ilike('name', `%${serviceName}%`)
            .limit(1)
            .maybeSingle();
          
          if (fuzzyMatch) {
            resolvedServiceId = fuzzyMatch.id;
          } else {
            // Normalize abbreviations: "Min" -> "Minute", "Hr" -> "Hour" etc. and retry
            const normalized = serviceName
              .replace(/\bMin\b/gi, 'Minute')
              .replace(/\bMins\b/gi, 'Minutes')
              .replace(/\bHr\b/gi, 'Hour')
              .replace(/\bHrs\b/gi, 'Hours');
            
            if (normalized !== serviceName) {
              const { data: normalizedMatch } = await supabase
                .from('services')
                .select('id, name')
                .ilike('name', `%${normalized}%`)
                .limit(1)
                .maybeSingle();
              resolvedServiceId = normalizedMatch?.id || null;
            }
            
            // Last resort: match by extracting duration + category keywords
            if (!resolvedServiceId) {
              const durationMatch = serviceName.match(/(\d+)/);
              if (durationMatch) {
                const keywords = serviceName.replace(/\d+/g, '').replace(/\b(min|mins|minute|minutes|hr|hour|hours)\b/gi, '').trim();
                if (keywords) {
                  const { data: keywordMatch } = await supabase
                    .from('services')
                    .select('id, name')
                    .ilike('name', `%${durationMatch[1]}%`)
                    .ilike('name', `%${keywords}%`)
                    .limit(1)
                    .maybeSingle();
                  resolvedServiceId = keywordMatch?.id || null;
                }
              }
            }
          }
        }
        console.log(`Resolved service "${serviceName}" to ID: ${resolvedServiceId}`);
      }
    }

    // Auto-detect insurance booking from service category
    let detectedInsurance = isInsuranceBooking || false;
    if (resolvedServiceId && !detectedInsurance) {
      const { data: svcCat } = await supabase
        .from('services')
        .select('category')
        .eq('id', resolvedServiceId)
        .single();
      if (svcCat?.category === 'insurance') {
        detectedInsurance = true;
        console.log('Auto-detected insurance booking from service category');
      }
    }

    // Auto-assign practitioner if none specified
    let resolvedPractitionerId = practitionerId || null;
    if (!resolvedPractitionerId) {
      // Find practitioners who can do this service
      let candidatePractitioners: { id: string; name: string }[] = [];
      
      if (resolvedServiceId) {
        // Get service to check practitioner_ids
        const { data: svcData } = await supabase
          .from('services')
          .select('practitioner_ids')
          .eq('id', resolvedServiceId)
          .single();
        
        if (svcData?.practitioner_ids && svcData.practitioner_ids.length > 0) {
          const { data: practitioners } = await supabase
            .from('practitioners')
            .select('id, name')
            .in('id', svcData.practitioner_ids)
            .eq('is_active', true);
          candidatePractitioners = practitioners || [];
        }
      }
      
      // Fallback: get all active practitioners
      if (candidatePractitioners.length === 0) {
        const { data: allPractitioners } = await supabase
          .from('practitioners')
          .select('id, name')
          .eq('is_active', true);
        candidatePractitioners = allPractitioners || [];
      }

      // Calculate day_of_week for the booking date (0=Sun, 6=Sat)
      const bookingDayOfWeek = new Date(bookingDate + 'T12:00:00').getDay();

      // Filter candidates: must have an is_available=true block covering this day/time
      const { data: allAvailBlocks } = await supabase
        .from('availability_blocks')
        .select('practitioner_id, day_of_week, start_time, end_time, is_available')
        .in('practitioner_id', candidatePractitioners.map(p => p.id))
        .eq('day_of_week', bookingDayOfWeek)
        .eq('is_available', true);

      const availableOnDay = new Set(
        (allAvailBlocks || [])
          .filter(ab => toHHMM(ab.start_time) <= startHHMM && toHHMM(ab.end_time) >= bufferedEndHHMM)
          .map(ab => ab.practitioner_id)
      );

      // #region agent log
      console.log('[SUBMIT-CONFLICT] auto_assign_availability_snapshot', {
        bookingDate,
        startTime,
        endTime,
        bufferedEndTime,
        startHHMM,
        endHHMM,
        bufferedEndHHMM,
        candidateCount: candidatePractitioners.length,
        availBlockRowCount: (allAvailBlocks || []).length,
        availableOnDayCount: availableOnDay.size,
        sampleBlocks: (allAvailBlocks || []).slice(0, 5).map((ab: any) => ({
          practitioner_id: ab.practitioner_id,
          day_of_week: ab.day_of_week,
          start_time: ab.start_time,
          end_time: ab.end_time,
          startHHMM: toHHMM(ab.start_time),
          endHHMM: toHHMM(ab.end_time),
        })),
      });
      // #endregion

      // Also exclude practitioners with zero availability blocks at all
      const { data: anyBlocks } = await supabase
        .from('availability_blocks')
        .select('practitioner_id')
        .in('practitioner_id', candidatePractitioners.map(p => p.id))
        .eq('is_available', true);
      
      const hasAnySchedule = new Set((anyBlocks || []).map(ab => ab.practitioner_id));
      
      const scheduledCandidates = candidatePractitioners.filter(
        p => hasAnySchedule.has(p.id) && availableOnDay.has(p.id)
      );

      console.log(`Candidates with schedule for day ${bookingDayOfWeek} at ${startTime}-${bufferedEndTime}: ${scheduledCandidates.map(p => p.name).join(', ') || 'none'}`);
      
      let eliminatedByBookingConflict = 0;
      let eliminatedByCalendarBusy = 0;
      let eliminatedByCalendarVerifyFail = 0;

      // Find first practitioner without a booking or calendar conflict at this time
      for (const p of scheduledCandidates) {
        const { data: conflicts } = await supabase
          .from('bookings')
          .select('id')
          .eq('booking_date', bookingDate)
          .eq('practitioner_id', p.id)
          .neq('status', 'cancelled')
          .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);
        
        if (conflicts && conflicts.length > 0) {
          eliminatedByBookingConflict++;
          continue;
        }

        // Also check Google Calendar busy times
        const calendarCheck = await checkCalendarBusyConflict(supabase, p.id, bookingDate, startHHMM, bufferedEndHHMM, "[SUBMIT]");
        if (calendarCheck.hasConflict) {
          if (calendarCheck.reason === 'verification_failed') eliminatedByCalendarVerifyFail++;
          else eliminatedByCalendarBusy++;
          console.log(`Skipping ${p.name} — calendar conflict (${calendarCheck.reason})`);
          continue;
        }
        // When this practitioner is the ONLY one for this service, require calendar connection
        // to verify availability — no_connection means we cannot confirm they're free
        if (calendarCheck.reason === 'no_connection' && candidatePractitioners.length === 1) {
          eliminatedByCalendarVerifyFail++;
          console.log(`Skipping ${p.name} — sole practitioner for service but no calendar connection to verify availability`);
          continue;
        }

        resolvedPractitionerId = p.id;
        console.log(`Auto-assigned practitioner: ${p.name} (${p.id})`);
        break;
      }

      // If auto-assignment failed, no practitioner is available — reject the booking
      if (!resolvedPractitionerId) {
        console.log('[SUBMIT-DECISION] no_practitioner_available', {
          bookingDate,
          startTime: startHHMM,
          endTime: bufferedEndHHMM,
          candidateCount: candidatePractitioners.length,
          scheduledCandidateCount: scheduledCandidates.length,
          eliminatedByBookingConflict,
          eliminatedByCalendarBusy,
          eliminatedByCalendarVerifyFail,
        });
        console.log(`Auto-assignment failed: no practitioners available for ${bookingDate} ${startTime}-${bufferedEndTime}`);
        return new Response(
          JSON.stringify({ error: 'No practitioners are available during this time. Please select a different time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // --- Handle 2nd practitioner for couples massage ---
    const resolvedPractitioner2Id = practitioner2Id || null;
    if (resolvedPractitioner2Id) {
      // Validate 2nd practitioner has availability_blocks for this day/time
      const p2DayOfWeek = new Date(bookingDate + 'T12:00:00').getDay();
      const { data: p2ScheduleBlocks } = await supabase
        .from('availability_blocks')
        .select('start_time, end_time')
        .eq('practitioner_id', resolvedPractitioner2Id)
        .eq('day_of_week', p2DayOfWeek)
        .eq('is_available', true);

      const p2HasSchedule = (p2ScheduleBlocks || []).some(
        ab => toHHMM(ab.start_time) <= startHHMM && toHHMM(ab.end_time) >= bufferedEndHHMM
      );

      if (!p2HasSchedule) {
        console.log(`2nd practitioner ${resolvedPractitioner2Id} has no schedule covering ${startTime}-${bufferedEndTime} on day ${p2DayOfWeek}`);
        return new Response(
          JSON.stringify({ error: 'The second practitioner is not available during this time. Please select a different practitioner or time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check conflicts for 2nd practitioner (internal bookings)
      const { data: p2Conflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .neq('status', 'cancelled')
        .or(
          `and(practitioner_id.eq.${resolvedPractitioner2Id},start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM}),` +
          `and(practitioner_2_id.eq.${resolvedPractitioner2Id},start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`
        );

      if (p2Conflicts && p2Conflicts.length > 0) {
        return new Response(
          JSON.stringify({ error: 'The second practitioner is already booked during this time. Please select a different practitioner or time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also check Google Calendar busy times for the 2nd practitioner
      const p2CalendarCheck = await checkCalendarBusyConflict(supabase, resolvedPractitioner2Id, bookingDate, startHHMM, bufferedEndHHMM, "[SUBMIT]");
      if (p2CalendarCheck.hasConflict) {
        console.log(`2nd practitioner ${resolvedPractitioner2Id} has Google Calendar conflict on ${bookingDate} ${startTime}-${bufferedEndTime}`);
        return new Response(
          JSON.stringify({ error: 'The second practitioner has a schedule conflict during this time. Please select a different practitioner or time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`2nd practitioner resolved: ${resolvedPractitioner2Id}`);
    }

    // Check for conflicts with existing bookings (using resolved practitioner)
    if (resolvedPractitionerId) {
      // FIRST: Validate practitioner has availability_blocks for this day/time
      const selectedDayOfWeek = new Date(bookingDate + 'T12:00:00').getDay();
      const { data: scheduleBlocks } = await supabase
        .from('availability_blocks')
        .select('start_time, end_time')
        .eq('practitioner_id', resolvedPractitionerId)
        .eq('day_of_week', selectedDayOfWeek)
        .eq('is_available', true);

      const hasSchedule = (scheduleBlocks || []).some(
        ab => toHHMM(ab.start_time) <= startHHMM && toHHMM(ab.end_time) >= bufferedEndHHMM
      );

      if (!hasSchedule) {
        console.log(`Practitioner ${resolvedPractitionerId} has no schedule covering ${startTime}-${bufferedEndTime} on day ${selectedDayOfWeek}`);
        return new Response(
          JSON.stringify({ error: 'This practitioner is not available during this time. Please select a different practitioner or time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: practitionerConflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .eq('practitioner_id', resolvedPractitionerId)
        .neq('status', 'cancelled')
        .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);

      if (practitionerConflicts && practitionerConflicts.length > 0) {
        return new Response(
          JSON.stringify({ error: 'This practitioner is already booked during this time. Please select a different time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also check Google Calendar busy times for the assigned practitioner
      // If busy, silently try to reassign to another available practitioner instead of rejecting
      const calendarCheck = await checkCalendarBusyConflict(supabase, resolvedPractitionerId, bookingDate, startHHMM, bufferedEndHHMM, "[SUBMIT]");
      if (calendarCheck.hasConflict) {
        console.log(`Selected practitioner ${resolvedPractitionerId} has calendar conflict, attempting auto-reassign...`);
        
        // Get all active practitioners who can do this service
        let fallbackCandidates: { id: string; name: string }[] = [];
        if (resolvedServiceId) {
          const { data: svcData } = await supabase
            .from('services')
            .select('practitioner_ids')
            .eq('id', resolvedServiceId)
            .single();
          if (svcData?.practitioner_ids && svcData.practitioner_ids.length > 0) {
            const { data: practitioners } = await supabase
              .from('practitioners')
              .select('id, name')
              .in('id', svcData.practitioner_ids)
              .eq('is_active', true);
            fallbackCandidates = (practitioners || []).filter((p: any) => p.id !== resolvedPractitionerId);
          }
        }
        if (fallbackCandidates.length === 0) {
          const { data: allP } = await supabase
            .from('practitioners')
            .select('id, name')
            .eq('is_active', true);
          fallbackCandidates = (allP || []).filter((p: any) => p.id !== resolvedPractitionerId);
        }

        // Filter fallback candidates by availability_blocks for this day/time
        const fbDayOfWeek = new Date(bookingDate + 'T12:00:00').getDay();
        const { data: fbAvailBlocks } = await supabase
          .from('availability_blocks')
          .select('practitioner_id, start_time, end_time')
          .in('practitioner_id', fallbackCandidates.map(p => p.id))
          .eq('day_of_week', fbDayOfWeek)
          .eq('is_available', true);

        const fbAvailableOnDay = new Set(
          (fbAvailBlocks || [])
            .filter(ab => toHHMM(ab.start_time) <= startHHMM && toHHMM(ab.end_time) >= bufferedEndHHMM)
            .map(ab => ab.practitioner_id)
        );
        fallbackCandidates = fallbackCandidates.filter(p => fbAvailableOnDay.has(p.id));

        let reassigned = false;
        for (const p of fallbackCandidates) {
          const { data: conflicts } = await supabase
            .from('bookings')
            .select('id')
            .eq('booking_date', bookingDate)
            .eq('practitioner_id', p.id)
            .neq('status', 'cancelled')
            .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);
          if (conflicts && conflicts.length > 0) continue;

          const pCalendarCheck = await checkCalendarBusyConflict(supabase, p.id, bookingDate, startHHMM, bufferedEndHHMM, "[SUBMIT]");
          if (pCalendarCheck.hasConflict) continue;

          resolvedPractitionerId = p.id;
          console.log(`Auto-reassigned to ${p.name} (${p.id}) due to calendar conflict`);
          reassigned = true;
          break;
        }

        if (!reassigned) {
          return new Response(
            JSON.stringify({ error: 'No practitioners are available during this time. Please select a different time.' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Check room conflicts if room is assigned
    if (roomId) {
      const { data: roomConflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', bookingDate)
        .eq('room_id', roomId)
        .neq('status', 'cancelled')
        .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);

      if (roomConflicts && roomConflicts.length > 0) {
        return new Response(
          JSON.stringify({ error: 'This room is already booked during this time.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check for duplicate client booking (same person, overlapping time)
    {
      const { data: clientDuplicates } = await supabase
        .from('bookings')
        .select('id, start_time, end_time')
        .eq('booking_date', bookingDate)
        .eq('client_email', clientEmail.toLowerCase())
        .neq('status', 'cancelled')
        .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);

      if (clientDuplicates && clientDuplicates.length > 0) {
        console.log(`Duplicate booking blocked for ${clientEmail} on ${bookingDate} at ${startTime}`);
        return new Response(
          JSON.stringify({ 
            error: 'You already have a booking during this time. Please choose a different time slot.',
            code: 'DUPLICATE_CLIENT_BOOKING'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get practitioner details for SMS
    let practitionerPhone: string | null = null;
    let practitionerName: string | null = null;
    if (resolvedPractitionerId) {
      const { data: practitioner } = await supabase
        .from('practitioners')
        .select('name, phone')
        .eq('id', resolvedPractitionerId)
        .single();
      
      if (practitioner) {
        practitionerPhone = practitioner.phone;
        practitionerName = practitioner.name;
      }
    }

    // Build notes with extras if provided
    let fullNotes = notes || '';
    if (extras && extras.length > 0) {
      fullNotes = `${fullNotes}\nExtras: ${extras.join(', ')}`.trim();
    }
    if (isOutcall) {
      fullNotes = `${fullNotes}\n[Outcall service - 30min buffer included]`.trim();
      if (location) {
        fullNotes = `[OUTCALL LOCATION: ${location}]\n${fullNotes}`.trim();
      }
    }

    // Auto-assign room if not specified (for in-studio services)
    // Logic: Try first available room, then second. If both are booked, reject the booking.
    let assignedRoomId = roomId || null;
    if (!assignedRoomId && !isOutcall) {
      // Get all active rooms ordered by name (ensures consistent ordering)
      const { data: allRooms } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (allRooms && allRooms.length > 0) {
        // Find a room that's not booked during this time
        for (const room of allRooms) {
          const { data: conflicts } = await supabase
            .from('bookings')
            .select('id')
            .eq('booking_date', bookingDate)
            .eq('room_id', room.id)
            .neq('status', 'cancelled')
            .or(`and(start_time.lt.${bufferedEndHHMM},end_time.gt.${startHHMM})`);

          if (!conflicts || conflicts.length === 0) {
            assignedRoomId = room.id;
            console.log(`Auto-assigned room: ${room.name} (${room.id})`);
            break;
          } else {
            console.log(`Room ${room.name} has conflicts, trying next room...`);
          }
        }

        // CRITICAL: If no room is available, reject the booking
        if (!assignedRoomId) {
          console.log('All rooms are booked for this time slot - rejecting booking');
          return new Response(
            JSON.stringify({ 
              error: 'No rooms available for this time slot. All massage rooms are already booked. Please select a different time.',
              code: 'NO_ROOM_AVAILABLE'
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // SAFETY: Never create unassigned bookings for services that require specific practitioners
    // (e.g. Massage With Insurance — only Alea can perform; if she's blocked, reject)
    if (!resolvedPractitionerId && resolvedServiceId) {
      const { data: svcCheck } = await supabase
        .from('services')
        .select('name, practitioner_ids')
        .eq('id', resolvedServiceId)
        .single();
      if (svcCheck?.practitioner_ids && svcCheck.practitioner_ids.length > 0) {
        console.log('[SUBMIT-DECISION] blocked_unassigned_restricted_service', {
          serviceName: svcCheck.name,
          practitionerIds: svcCheck.practitioner_ids,
          bookingDate,
          startTime: startHHMM,
        });
        return new Response(
          JSON.stringify({
            error: 'No practitioners are available during this time. The practitioner for this service may be blocked or fully booked. Please select a different time.',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone,
        practitioner_id: resolvedPractitionerId,
        practitioner_2_id: resolvedPractitioner2Id,
        room_id: assignedRoomId,
        service_id: resolvedServiceId,
        booking_date: bookingDate,
        start_time: startHHMM,
        end_time: bufferedEndHHMM, // Use buffered end time for outcalls
        notes: fullNotes || null,
        total_amount: detectedInsurance ? 0 : (totalAmount || null),
        balance_due: detectedInsurance ? 0 : null,
        deposit_paid: false,
        status: 'pending_approval',
        // Insurance fields
        is_insurance_booking: detectedInsurance,
        insurance_provider: insuranceProvider || null,
        insurance_policy_number: insurancePolicyNumber || null,
        insurance_group_number: insuranceGroupNumber || null,
        insurance_member_id: insuranceMemberId || null,
        insurance_subscriber_name: insuranceSubscriberName || null,
        insurance_subscriber_dob: insuranceSubscriberDob || null,
        insurance_verified: false,
        consent_email: consentEmail || false,
        consent_sms: consentSms || false,
      })
      .select()
      .single();

    if (bookingError) {
      console.error('Booking creation error:', bookingError);
      // Handle DB-level overlap constraint (BUG-15 trigger)
      if (bookingError.code === '23505' || bookingError.message?.includes('already booked')) {
        return new Response(
          JSON.stringify({ error: 'This time slot is no longer available. Please select a different time.', code: 'SLOT_CONFLICT' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Failed to create booking', details: bookingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Booking created successfully:', booking.id);
    await debugLog(supabase, "submit-booking:bookings.insert", "Booking saved", { booking_id: booking.id, booking_date: bookingDate, start_time: startHHMM });

    // ── Klaviyo server-side tracking ──
    const KLAVIYO_PRIVATE_API_KEY = Deno.env.get('KLAVIYO_PRIVATE_API_KEY');
    if (KLAVIYO_PRIVATE_API_KEY) {
      try {
        // 1. Create/update profile
        const nameParts = clientName.trim().split(/\s+/);
        const klaviyoProfilePayload = {
          data: {
            type: 'profile',
            attributes: {
              email: clientEmail,
              first_name: nameParts[0] || '',
              last_name: nameParts.slice(1).join(' ') || '',
              phone_number: clientPhone ? (clientPhone.replace(/[^\d+]/g, '').startsWith('+') ? clientPhone.replace(/[^\d+]/g, '') : '+1' + clientPhone.replace(/\D/g, '')) : undefined,
              properties: {
                'Last Booking Date': bookingDate,
                'Last Service': serviceName || 'Appointment',
                'SMS Consent': consentSms || false,
                'Email Consent': consentEmail || false,
              },
            },
          },
        };

        const profileRes = await fetch('https://a.klaviyo.com/api/profiles/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
            'Content-Type': 'application/json',
            'revision': '2024-10-15',
          },
          body: JSON.stringify(klaviyoProfilePayload),
        });

        // Handle 409 (profile exists) — update instead
        let profileId: string | null = null;
        if (profileRes.status === 409) {
          const conflictData = await profileRes.json();
          profileId = conflictData?.errors?.[0]?.meta?.duplicate_profile_id || null;
          // Update existing profile with latest info
          if (profileId) {
            await fetch(`https://a.klaviyo.com/api/profiles/${profileId}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
                'Content-Type': 'application/json',
                'revision': '2024-10-15',
              },
              body: JSON.stringify({
                data: {
                  type: 'profile',
                  id: profileId,
                  attributes: klaviyoProfilePayload.data.attributes,
                },
              }),
            });
          }
        } else if (profileRes.ok) {
          const profileData = await profileRes.json();
          profileId = profileData?.data?.id || null;
        } else {
          const errBody = await profileRes.text();
          console.error('Klaviyo profile creation failed:', profileRes.status, errBody);
        }

        // 2. Track "Appointment Created" event
        const [evHours, evMinutes] = startTime.split(':');
        const evHour = parseInt(evHours);
        const evAmpm = evHour >= 12 ? 'PM' : 'AM';
        const evHour12 = evHour % 12 || 12;
        const evFormattedTime = `${evHour12}:${evMinutes} ${evAmpm}`;

        const eventPayload = {
          data: {
            type: 'event',
            attributes: {
              metric: { data: { type: 'metric', attributes: { name: 'Appointment Created' } } },
              profile: { data: { type: 'profile', attributes: { email: clientEmail } } },
              properties: {
                BookingId: booking.id,
                ServiceName: serviceName || 'Appointment',
                BookingDate: bookingDate,
                StartTime: evFormattedTime,
                TotalAmount: totalAmount || 0,
                PractitionerName: practitionerName || 'Any Available',
                Extras: extras || [],
                IsOutcall: isOutcall || false,
                IsInsurance: detectedInsurance,
                Status: 'pending_approval',
              },
              time: new Date().toISOString(),
              unique_id: booking.id,
            },
          },
        };

        const eventRes = await fetch('https://a.klaviyo.com/api/events/', {
          method: 'POST',
          headers: {
            'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
            'Content-Type': 'application/json',
            'revision': '2024-10-15',
          },
          body: JSON.stringify(eventPayload),
        });

        if (!eventRes.ok) {
          const errBody = await eventRes.text();
          console.error('Klaviyo event tracking failed:', eventRes.status, errBody);
        } else {
          console.log('Klaviyo: Appointment Created event tracked for', clientEmail);
        }

        // 3. Subscribe to SMS list if client consented
        if (consentSms && profileId) {
          const KLAVIYO_SMS_LIST_ID = Deno.env.get('KLAVIYO_SMS_LIST_ID');
          if (KLAVIYO_SMS_LIST_ID) {
            try {
              const phoneForKlaviyo = clientPhone
                ? (clientPhone.replace(/[^\d+]/g, '').startsWith('+')
                    ? clientPhone.replace(/[^\d+]/g, '')
                    : '+1' + clientPhone.replace(/\D/g, ''))
                : null;

              if (phoneForKlaviyo) {
                const subscribeRes = await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_API_KEY}`,
                    'Content-Type': 'application/json',
                    'revision': '2024-10-15',
                  },
                  body: JSON.stringify({
                    data: {
                      type: 'profile-subscription-bulk-create-job',
                      attributes: {
                        profiles: {
                          data: [{
                            type: 'profile',
                            attributes: {
                              email: clientEmail,
                              phone_number: phoneForKlaviyo,
                              subscriptions: {
                                sms: { marketing: { consent: 'SUBSCRIBED' } },
                              },
                            },
                          }],
                        },
                      },
                      relationships: {
                        list: { data: { type: 'list', id: KLAVIYO_SMS_LIST_ID } },
                      },
                    },
                  }),
                });

                if (subscribeRes.ok || subscribeRes.status === 202) {
                  console.log('Klaviyo: SMS subscription created for', clientEmail);
                } else {
                  const errBody = await subscribeRes.text();
                  console.error('Klaviyo SMS subscription failed:', subscribeRes.status, errBody);
                }
              }
            } catch (smsSubErr) {
              console.error('Klaviyo SMS subscription error (non-blocking):', smsSubErr);
            }
          }
        }
      } catch (klErr) {
        // Non-blocking — don't fail the booking if Klaviyo tracking fails
        console.error('Klaviyo tracking error (non-blocking):', klErr);
      }
    } else {
      console.log('KLAVIYO_PRIVATE_API_KEY not configured, skipping server-side tracking');
    }

    // Upsert customer record so every client is logged even if booking is later cancelled
    let customerId: string | null = null;
    try {
      const nameParts = clientName.trim().split(/\s+/);
      const firstName = nameParts[0] || clientName;
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if customer already exists by email
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id')
        .eq('email', clientEmail.toLowerCase())
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // Update phone if provided and different
        await supabase
          .from('customers')
          .update({ 
            phone: clientPhone || undefined,
            last_appointment: new Date().toISOString(),
          })
          .eq('id', customerId);
        await debugLog(supabase, "submit-booking:customers.update", "Customer updated", { customer_id: customerId, booking_id: booking.id });
      } else {
        const { data: newCustomer } = await supabase
          .from('customers')
          .insert({
            first_name: firstName,
            last_name: lastName,
            email: clientEmail.toLowerCase(),
            phone: clientPhone || null,
          })
          .select('id')
          .single();
        customerId = newCustomer?.id || null;
        if (customerId) await debugLog(supabase, "submit-booking:customers.insert", "Customer created", { customer_id: customerId, booking_id: booking.id });
      }

      // Link customer to booking
      if (customerId) {
        await supabase
          .from('bookings')
          .update({ customer_id: customerId })
          .eq('id', booking.id);
        await debugLog(supabase, "submit-booking:bookings.update", "Booking linked to customer", { booking_id: booking.id, customer_id: customerId });
        console.log('Customer linked to booking:', customerId);
      }
    } catch (custErr) {
      // Non-blocking — don't fail the booking if customer upsert fails
      console.error('Customer upsert error (non-blocking):', custErr);
    }

    // Format date and time for notifications
    const dateObj = new Date(bookingDate + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    const [hours, minutes] = startTime.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    const formattedTime = `${hour12}:${minutes} ${ampm}`;

    const serviceDisplay = serviceName || 'massage session';

    // Subscribe client to Klaviyo SMS if they consented
    let clientSMSSent = false;
    if (consentSms && clientPhone) {
      clientSMSSent = await sendSMSViaKlaviyo(clientPhone, clientName, clientEmail);
      
      // Log SMS subscription
      if (clientSMSSent) {
        await supabase.from('sms_messages').insert({
          customer_phone: clientPhone,
          customer_name: clientName,
          direction: 'outbound',
          content: `[Klaviyo] SMS subscription for booking confirmation flow`,
          status: 'sent',
          booking_id: booking.id,
        });
        await debugLog(supabase, "submit-booking:sms_messages.insert", "SMS message logged", { booking_id: booking.id });
      }
    } else {
      console.log('Client did not consent to SMS notifications, skipping SMS');
    }

    // Client confirmation email is sent after booking approval (in approve-booking function)
    // Not sent here because this is just the initial submission/request
    const clientEmailSent = false;

    // Send staff notifications with retry (email + SMS with one-click confirm/reschedule links)
    let staffNotified = false;
    for (let attempt = 1; attempt <= 3 && !staffNotified; attempt++) {
      try {
        console.log(`Staff notification attempt ${attempt}/3 for booking ${booking.id}`);
        const notifyResponse = await fetch(`${SUPABASE_URL}/functions/v1/notify-staff-booking`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bookingId: booking.id }),
        });
        
        if (notifyResponse.ok) {
          const notifyResult = await notifyResponse.json();
          staffNotified = notifyResult.success;
          console.log('Staff notification result:', notifyResult);
        } else {
          const errText = await notifyResponse.text();
          console.error(`Staff notification HTTP error (attempt ${attempt}):`, notifyResponse.status, errText);
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
        }
      } catch (notifyError) {
        console.error(`Staff notification exception (attempt ${attempt}):`, notifyError);
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
      }
    }

    if (!staffNotified) {
      console.error(`CRITICAL: All 3 staff notification attempts failed for booking ${booking.id}`);
      // Log to audit_logs for visibility
      try {
        const supabaseAudit = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabaseAudit.from('audit_logs').insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          action: 'notification_failed',
          resource_type: 'booking',
          resource_id: booking.id,
          details: { function: 'submit-booking', target: 'notify-staff-booking', attempts: 3, channel: 'email' },
        });
        await debugLog(supabaseAudit, "submit-booking:audit_logs.insert", "Audit log (notification_failed)", { booking_id: booking.id });
      } catch (auditErr) {
        console.error('Audit log insert failed:', auditErr);
      }
    }

    const depositToken = await generateDepositToken(booking.id);

    logStructured("info", "booking_created", "submit-booking", {
      bookingId: booking.id,
      bookingDate: booking.booking_date,
      practitionerId: booking.practitioner_id ?? null,
    });

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
        },
        depositToken,
        clientNotified: clientSMSSent,
        staffNotified: staffNotified,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in submit-booking:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

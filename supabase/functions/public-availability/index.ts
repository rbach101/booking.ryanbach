import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

// Decryption utility
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY || '');
  return await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken.startsWith('enc:')) {
    return encryptedToken;
  }
  if (!TOKEN_ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }
  const key = await getEncryptionKey();
  const combined = decodeBase64(encryptedToken.slice(4));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

async function refreshTokenIfNeeded(supabase: any, connection: any) {
  const expiryDate = new Date(connection.google_token_expiry);
  const now = new Date();
  
  if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
    if (!connection.google_refresh_token) {
      throw { code: 'TOKEN_EXPIRED', message: 'No refresh token available' };
    }
    const decryptedRefreshToken = await decryptToken(connection.google_refresh_token);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: decryptedRefreshToken,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      await supabase
        .from('calendar_connections')
        .update({ is_connected: false })
        .eq('id', connection.id);
      throw { code: 'TOKEN_EXPIRED', message: 'Calendar connection expired' };
    }
    if (tokenData.access_token) {
      const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
      await supabase
        .from('calendar_connections')
        .update({
          google_access_token: tokenData.access_token,
          google_token_expiry: newExpiry.toISOString(),
        })
        .eq('id', connection.id);
      return tokenData.access_token;
    }
  }
  return await decryptToken(connection.google_access_token);
}

// Helper: compute Monday (UTC) for a given date string
function getMondayForDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + offset);
  return monday.toISOString().split('T')[0];
}

// Helper: get all Monday week-starts that a date range spans
function getWeeksInRange(startDate: string, endDate: string): string[] {
  const weeks = new Set<string>();
  const cursor = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T23:59:59Z');
  while (cursor <= end) {
    weeks.add(getMondayForDate(cursor.toISOString().split('T')[0]));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Array.from(weeks);
}

// HYBRID cache approach: use cache per-connection where valid, live API where not
async function getHybridBusyTimes(
  supabase: any,
  connections: any[],
  queryStartDate: string,
  queryEndDate: string,
  timeMin: string,
  timeMax: string
): Promise<{ [key: string]: { start: string; end: string }[] }> {
  const busyTimes: { [key: string]: { start: string; end: string }[] } = {};
  const connectionIds = connections.map(c => c.id);
  
  if (connectionIds.length === 0) return busyTimes;

  // Fetch ALL cache entries for these connections
  const { data: cacheEntries } = await supabase
    .from('calendar_busy_cache')
    .select('*')
    .in('connection_id', connectionIds);

  const allCacheEntries = cacheEntries || [];
  const now = new Date();
  const maxAge = 10 * 60 * 1000; // 10 minutes — tighter freshness window
  const requiredWeeks = getWeeksInRange(queryStartDate, queryEndDate);

  // For each connection, decide: use cache or live API
  const connectionsNeedingLive: any[] = [];
  const cachedResults: { key: string; entries: any[] }[] = [];

  for (const connection of connections) {
    const connEntries = allCacheEntries.filter((e: any) => e.connection_id === connection.id);
    
    // Check 1: Does this connection have ANY cache entries?
    if (connEntries.length === 0) {
      console.log(`[HYBRID] No cache for connection ${connection.id} (${connection.owner_type}/${connection.owner_id}), using live API`);
      connectionsNeedingLive.push(connection);
      continue;
    }

    // Check 2: Are ALL entries fresh enough?
    const anyFresh = connEntries.some((e: any) => {
      return now.getTime() - new Date(e.updated_at).getTime() < maxAge;
    });
    if (!anyFresh) {
      console.log(`[HYBRID] Stale cache for connection ${connection.id}, using live API`);
      connectionsNeedingLive.push(connection);
      continue;
    }

    // Check 3: Does cache cover ALL required weeks for this connection?
    const connWeeks = new Set(connEntries.map((e: any) => e.week_start));
    const missingWeeks = requiredWeeks.filter(w => !connWeeks.has(w));
    if (missingWeeks.length > 0) {
      console.log(`[HYBRID] Cache missing weeks ${missingWeeks.join(',')} for connection ${connection.id}, using live API`);
      connectionsNeedingLive.push(connection);
      continue;
    }

    // Cache is valid for this connection
    let key: string;
    if (connection.owner_type === 'main') key = 'main';
    else if (connection.owner_type === 'room') key = `room_${connection.owner_id}`;
    else key = connection.owner_id;

    cachedResults.push({ key, entries: connEntries });
  }

  // Process cached connections
  const startDate = new Date(queryStartDate + 'T00:00:00');
  const endDate = new Date(queryEndDate + 'T23:59:59');

  for (const { key, entries } of cachedResults) {
    for (const entry of entries) {
      const cached = (entry.busy_times as any[]) || [];
      const filtered = cached.filter((bt: any) => {
        const btStart = new Date(bt.start);
        const btEnd = new Date(bt.end);
        return btEnd > startDate && btStart <= endDate;
      });
      if (filtered.length > 0) {
        busyTimes[key] = [...(busyTimes[key] || []), ...filtered];
      }
    }
  }

  // Fetch live API for connections that need it
  if (connectionsNeedingLive.length > 0) {
    console.log(`[HYBRID] Fetching live API for ${connectionsNeedingLive.length} connections`);
    const liveResults = await Promise.allSettled(connectionsNeedingLive.map(async (connection) => {
      try {
        const accessToken = await refreshTokenIfNeeded(supabase, connection);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id)}/events?` +
          new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: 'true',
            orderBy: 'startTime',
            fields: 'items(summary,start,end,transparency,status)',
          }),
          {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (!response.ok) {
          console.error(`[HYBRID] Events API error for ${connection.id}:`, response.status);
          return null;
        }

        const data = await response.json();
        const times = (data.items || [])
          .filter((ev: any) => {
            if (ev.status === 'cancelled') return false;
            if (ev.transparency === 'transparent') return false; // "Free" events don't block
            const lower = (ev.summary || '').toLowerCase();
            return !/birthday/i.test(lower) && !/\banniversary\b/i.test(lower);
          })
          .map((ev: any) => ({
            start: ev.start?.dateTime || ev.start?.date,
            end: ev.end?.dateTime || ev.end?.date,
            summary: ev.summary || 'Busy',
          }));

        let key: string;
        if (connection.owner_type === 'main') key = 'main';
        else if (connection.owner_type === 'room') key = `room_${connection.owner_id}`;
        else key = connection.owner_id;

        return { key, busyTimes: times };
      } catch (err: any) {
        console.error(`[HYBRID] Error fetching live for ${connection.id}:`, err?.message || err);
        return null;
      }
    }));

    liveResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value?.key && result.value.busyTimes.length > 0) {
        busyTimes[result.value.key] = [...(busyTimes[result.value.key] || []), ...result.value.busyTimes];
      }
    });
  }

  const cacheCount = cachedResults.length;
  const liveCount = connectionsNeedingLive.length;
  console.log(`[HYBRID] Done: ${cacheCount} from cache, ${liveCount} from live API, ${Object.keys(busyTimes).length} resources with busy times`);

  return busyTimes;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { date, startDate, endDate } = await req.json();

    let queryStartDate: string;
    let queryEndDate: string;

    if (startDate && endDate) {
      queryStartDate = startDate;
      queryEndDate = endDate;
    } else if (date) {
      queryStartDate = date;
      queryEndDate = date;
    } else {
      return new Response(
        JSON.stringify({ error: 'Date or startDate/endDate is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch rooms, connections, and bookings in parallel
    const [roomsResult, connectionsResult, bookingsResult] = await Promise.all([
      supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_connected', true)
        .in('owner_type', ['practitioner', 'room']),
      supabase
        .from('bookings')
        .select('id, booking_date, start_time, end_time, practitioner_id, room_id, status')
        .gte('booking_date', queryStartDate)
        .lte('booking_date', queryEndDate)
        .neq('status', 'cancelled'),
    ]);

    const rooms = roomsResult.data || [];
    const roomIds = rooms.map(r => r.id);
    const connections = connectionsResult.data || [];
    const existingBookings = bookingsResult.data || [];

    // Build room busy times from existing bookings
    const allBusyTimes: { [key: string]: { start: string; end: string }[] } = {};
    
    existingBookings.forEach(booking => {
      if (booking.room_id) {
        const key = `room_${booking.room_id}`;
        if (!allBusyTimes[key]) allBusyTimes[key] = [];
        const startDateTime = new Date(`${booking.booking_date}T${booking.start_time.substring(0,5)}:00-10:00`);
        const endDateTime = new Date(`${booking.booking_date}T${booking.end_time.substring(0,5)}:00-10:00`);
        allBusyTimes[key].push({ start: startDateTime.toISOString(), end: endDateTime.toISOString() });
      }
    });

    // HYBRID: use cache where valid, live API where not — per connection
    if (connections.length > 0) {
      // Compute live API time range for any connections that need it
      const startParts = queryStartDate.split('-').map(Number);
      const endParts = queryEndDate.split('-').map(Number);
      const timeMin = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2], 10, 0, 0)).toISOString();
      const timeMax = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 1, 9, 59, 59)).toISOString();

      const hybridBusy = await getHybridBusyTimes(supabase, connections, queryStartDate, queryEndDate, timeMin, timeMax);
      Object.entries(hybridBusy).forEach(([key, times]) => {
        allBusyTimes[key] = [...(allBusyTimes[key] || []), ...times];
      });
    }

    // Organize bookings by date for frontend consumption
    const bookingsByDate: { [dateStr: string]: any[] } = {};
    existingBookings.forEach(booking => {
      if (!bookingsByDate[booking.booking_date]) bookingsByDate[booking.booking_date] = [];
      bookingsByDate[booking.booking_date].push(booking);
    });

    return new Response(
      JSON.stringify({ 
        busyTimes: allBusyTimes,
        roomIds,
        bookings: bookingsByDate,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in public-availability:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
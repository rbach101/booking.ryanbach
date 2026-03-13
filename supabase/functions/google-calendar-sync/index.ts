import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BRAND } from "../_shared/brand.ts";
import { debugLog } from "../_shared/debugLog.ts";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

// Encryption utilities using AES-GCM
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY || '');
  return await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptToken(token: string): Promise<string> {
  if (!TOKEN_ENCRYPTION_KEY) {
    console.warn('TOKEN_ENCRYPTION_KEY not set, storing token unencrypted');
    return token;
  }
  
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedToken = new TextEncoder().encode(token);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedToken
    );
    
    // Combine IV + encrypted data and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return 'enc:' + encodeBase64(combined.buffer as ArrayBuffer);
  } catch (error) {
    console.error('Encryption error:', error);
    return token;
  }
}

async function decryptToken(encryptedToken: string): Promise<string> {
  // If not encrypted (no prefix), return as-is (for backward compatibility)
  if (!encryptedToken.startsWith('enc:')) {
    return encryptedToken;
  }
  
  if (!TOKEN_ENCRYPTION_KEY) {
    console.error('TOKEN_ENCRYPTION_KEY not set, cannot decrypt');
    throw new Error('Encryption key not configured');
  }
  
  try {
    const key = await getEncryptionKey();
    const combined = decodeBase64(encryptedToken.slice(4)); // Remove 'enc:' prefix
    
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt token');
  }
  }

// Format phone for tel: URI so Google Calendar can make it click-to-call
function formatPhoneForTelUri(phone: string | null | undefined): string {
  if (!phone || phone === 'N/A') return 'N/A';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return phone;
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  return `tel:${e164}`;
}

// Filter out birthday/anniversary events from Google Calendar results
// These are personal reminders that should not block availability
function isBirthdayEvent(summary: string): boolean {
  const lower = (summary || '').toLowerCase();
  return /birthday/i.test(lower) || /\bbirthday\b/.test(lower) || /\banniversary\b/i.test(lower);
}


async function refreshTokenIfNeeded(supabase: any, connection: any) {
  const expiryDate = new Date(connection.google_token_expiry);
  const now = new Date();
  
  // Refresh if token expires in less than 5 minutes
  if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
    console.log('Token expired or expiring soon for connection:', connection.id);
    
    // Check if we have a refresh token
    if (!connection.google_refresh_token) {
      console.error('No refresh token available for connection:', connection.id);
      // Return special error code for auto-reconnect
      throw { code: 'TOKEN_EXPIRED', connectionId: connection.id, message: 'No refresh token available' };
    }
    
    console.log('Refreshing token using refresh_token');
    
    // Decrypt refresh token before using
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
      console.error('Token refresh failed:', tokenData.error, tokenData.error_description);
      
      // Mark connection as disconnected if refresh fails
      await supabase
        .from('calendar_connections')
        .update({ is_connected: false })
        .eq('id', connection.id);
      
      // Return special error code for auto-reconnect
      throw { code: 'TOKEN_EXPIRED', connectionId: connection.id, message: 'Calendar connection expired' };
    }
    
    if (tokenData.access_token) {
      const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
      
      // Encrypt the new access token before storing
      const encryptedAccessToken = await encryptToken(tokenData.access_token);
      
      // If Google returns a new refresh token (rare but possible), update it too
      const updateData: any = {
        google_access_token: encryptedAccessToken,
        google_token_expiry: newExpiry.toISOString(),
      };
      
      if (tokenData.refresh_token) {
        console.log('New refresh token received during refresh, updating');
        updateData.google_refresh_token = await encryptToken(tokenData.refresh_token);
      }
      
      await supabase
        .from('calendar_connections')
        .update(updateData)
        .eq('id', connection.id);
      
      console.log('Token refreshed successfully, new expiry:', newExpiry.toISOString());
      
      // Return plaintext token for immediate use
      return tokenData.access_token;
    }
  }
  
  // Decrypt and return the stored token
  return await decryptToken(connection.google_access_token);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    // Authentication check - verify JWT token or service role key
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract token from Authorization header
    const token = authHeader.replace('Bearer ', '');
    
    // Create service role client for database operations
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Check if this is an internal service-role call (from other edge functions)
    const isServiceRoleCall = token === SUPABASE_SERVICE_ROLE_KEY;
    
    let callerId = 'service-role';

    if (!isServiceRoleCall) {
      // External call — verify user JWT
      const supabaseUser = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } }
      });

      const { data: userData, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !userData?.user) {
        console.error('Invalid or expired token:', userError?.message);
        return new Response(
          JSON.stringify({ error: 'Unauthorized - invalid token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      callerId = userData.user.id;

      // Verify user has admin or staff role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', callerId);
      
      const userRoles = roles?.map(r => r.role) || [];
      const isAuthorized = userRoles.includes('admin') || userRoles.includes('staff');
      
      if (!isAuthorized) {
        console.error('User lacks required role:', callerId);
        return new Response(
          JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { action, bookingId, connectionId, startDate, endDate, ownerType: reqOwnerType, ownerId: reqOwnerId, searchSummary } = await req.json();

    console.log('Google Calendar Sync action:', action, 'by:', callerId);

    if (action === 'create-event') {
      // Get booking details
      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .select(`
          *,
          practitioners:practitioner_id(name, email),
          practitioner2:practitioner_2_id(name, email),
          rooms:room_id(name),
          services:service_id(name, duration)
        `)
        .eq('id', bookingId)
        .single();

      if (bookingError || !booking) {
        return new Response(
          JSON.stringify({ error: 'Booking not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get all relevant calendar connections
      const connections = [];
      
      // Practitioner calendar
      if (booking.practitioner_id) {
        const { data: practConn } = await supabase
          .from('calendar_connections')
          .select('*')
          .eq('owner_type', 'practitioner')
          .eq('owner_id', booking.practitioner_id)
          .eq('is_connected', true)
          .maybeSingle();
        if (practConn) connections.push({ ...practConn, type: 'practitioner' });
      }

      // 2nd Practitioner calendar (for couples massage)
      if (booking.practitioner_2_id) {
        const { data: pract2Conn } = await supabase
          .from('calendar_connections')
          .select('*')
          .eq('owner_type', 'practitioner')
          .eq('owner_id', booking.practitioner_2_id)
          .eq('is_connected', true)
          .maybeSingle();
        if (pract2Conn) connections.push({ ...pract2Conn, type: 'practitioner2' });
      }

      // Room calendar
      if (booking.room_id) {
        const { data: roomConn } = await supabase
          .from('calendar_connections')
          .select('*')
          .eq('owner_type', 'room')
          .eq('owner_id', booking.room_id)
          .eq('is_connected', true)
          .maybeSingle();
        if (roomConn) connections.push({ ...roomConn, type: 'room' });
      }

      // Main booking calendar
      const { data: mainConn } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('owner_type', 'main')
        .eq('is_connected', true)
        .maybeSingle();
      if (mainConn) connections.push({ ...mainConn, type: 'main' });

      // Create event on each connected calendar
      const eventIds: { type: string; eventId: string; connectionId: string }[] = [];
      
      console.log(`Found ${connections.length} calendar connections to sync:`, connections.map(c => `${c.type}(${c.id})`));
      
      for (const conn of connections) {
        try {
          console.log(`Syncing to ${conn.type} calendar (${conn.id}, cal: ${conn.google_calendar_id})...`);
          const accessToken = await refreshTokenIfNeeded(supabase, conn);
          
          if (!accessToken) {
            console.error(`Failed to get access token for ${conn.type} calendar (${conn.id})`);
            continue;
          }
          
          const startDateTime = `${booking.booking_date}T${booking.start_time}`;
          const endDateTime = `${booking.booking_date}T${booking.end_time}`;
          
          const event = {
            summary: `${booking.services?.name || 'Appointment'} - ${booking.client_name}`,
            description: `Client: ${booking.client_name}\nEmail: ${booking.client_email}\nPhone: ${formatPhoneForTelUri(booking.client_phone)}\n${booking.notes ? 'Notes: ' + booking.notes : ''}`,
            start: {
              dateTime: startDateTime,
              timeZone: 'Pacific/Honolulu',
            },
            end: {
              dateTime: endDateTime,
              timeZone: 'Pacific/Honolulu',
            },
            location: booking.rooms?.name || BRAND.name,
          };

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${conn.google_calendar_id}/events`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(event),
            }
          );

          const eventData = await response.json();
          
          if (eventData.id) {
            eventIds.push({ type: conn.type, eventId: eventData.id, connectionId: conn.id });
            console.log(`Created event on ${conn.type} calendar:`, eventData.id);
          } else {
            console.error(`Failed to create event on ${conn.type} calendar (${conn.id}):`, JSON.stringify(eventData));
          }
        } catch (connError) {
          console.error(`Error syncing to ${conn.type} calendar (${conn.id}):`, (connError as any)?.message || connError);
        }
      }

      // Build a map of connection_id → event_id for per-calendar deletion later
      const eventIdsMap: Record<string, string> = {};
      for (const e of eventIds) {
        eventIdsMap[e.connectionId] = e.eventId;
      }

      // Update booking with event IDs (legacy single ID + new per-calendar map)
      const mainEventId = eventIds.find(e => e.type === 'main')?.eventId || eventIds[0]?.eventId;
      await supabase
        .from('bookings')
        .update({ 
          google_event_id: mainEventId || null,
          google_event_ids: eventIdsMap,
        })
        .eq('id', bookingId);
      await debugLog(supabase, "google-calendar-sync:bookings.update", "Booking linked to Google events", { booking_id: bookingId, event_ids: Object.keys(eventIdsMap).length });

      return new Response(
        JSON.stringify({ success: true, eventIds }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-busy-times') {
      // Get busy times from a calendar connection
      const { data: connection } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('is_connected', true)
        .single();

      if (!connection) {
        return new Response(
          JSON.stringify({ error: 'Calendar connection not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const accessToken = await refreshTokenIfNeeded(supabase, connection);

      // Use freebusy query to get busy times
      // Hawaii is UTC-10: midnight HST = 10:00 UTC
      const sParts = startDate.split('-').map(Number);
      const eParts = endDate.split('-').map(Number);
      const timeMin = new Date(Date.UTC(sParts[0], sParts[1] - 1, sParts[2], 10, 0, 0)).toISOString();
      const timeMax = new Date(Date.UTC(eParts[0], eParts[1] - 1, eParts[2] + 1, 9, 59, 59)).toISOString();

      console.log('Fetching busy times for calendar:', connection.google_calendar_id);
      console.log('Time range:', timeMin, 'to', timeMax);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id)}/events?` +
        new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: 'true',
          orderBy: 'startTime',
          fields: 'items(summary,start,end)',
        }),
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      console.log('Events response:', JSON.stringify(data));
      const busyTimes = (data.items || [])
        .filter((ev: any) => !isBirthdayEvent(ev.summary || ''))
        .map((ev: any) => ({
        start: ev.start?.dateTime || ev.start?.date,
        end: ev.end?.dateTime || ev.end?.date,
        summary: ev.summary || 'Busy',
      }));

      return new Response(
        JSON.stringify({ busyTimes }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-all-busy-times') {
      // Batch: fetch busy times for ALL connected calendars in one call
      const { data: connections, error: connErr } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_connected', true)
        .in('owner_type', ['practitioner', 'main', 'room']);

      if (connErr || !connections?.length) {
        return new Response(
          JSON.stringify({ busyTimes: {}, expired: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Hawaii is UTC-10: midnight HST = 10:00 UTC
      const sParts2 = startDate.split('-').map(Number);
      const eParts2 = endDate.split('-').map(Number);
      const timeMin = new Date(Date.UTC(sParts2[0], sParts2[1] - 1, sParts2[2], 10, 0, 0)).toISOString();
      const timeMax = new Date(Date.UTC(eParts2[0], eParts2[1] - 1, eParts2[2] + 1, 9, 59, 59)).toISOString();

      const allBusyTimes: Record<string, any[]> = {};
      const expired: Array<{ connectionId: string; ownerType: string; ownerId: string | null }> = [];

      // Fetch all busy times in parallel
      const results = await Promise.allSettled(
        connections.map(async (connection) => {
          try {
            const accessToken = await refreshTokenIfNeeded(supabase, connection);

            const response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id)}/events?` +
              new URLSearchParams({
                timeMin,
                timeMax,
                singleEvents: 'true',
                orderBy: 'startTime',
                fields: 'items(summary,start,end)',
              }),
              {
                method: 'GET',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              }
            );

            const data = await response.json();
            const busyTimes = (data.items || [])
              .filter((ev: any) => !isBirthdayEvent(ev.summary || ''))
              .map((ev: any) => ({
              start: ev.start?.dateTime || ev.start?.date,
              end: ev.end?.dateTime || ev.end?.date,
              summary: ev.summary || 'Busy',
            }));

            const key = connection.owner_type === 'main'
              ? 'main'
              : connection.owner_type === 'room'
                ? `room_${connection.owner_id}`
                : connection.owner_id;

            return { type: 'success' as const, key, busyTimes };
          } catch (err: any) {
            if (err?.code === 'TOKEN_EXPIRED') {
              return {
                type: 'expired' as const,
                connection: {
                  connectionId: connection.id,
                  ownerType: connection.owner_type,
                  ownerId: connection.owner_id,
                },
              };
            }
            console.error('Error fetching busy times for connection:', connection.id, err);
            return null;
          }
        })
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          if (result.value.type === 'expired') {
            expired.push(result.value.connection);
          } else if (result.value.type === 'success' && result.value.key) {
            allBusyTimes[result.value.key] = result.value.busyTimes;
          }
        }
      });

      return new Response(
        JSON.stringify({ busyTimes: allBusyTimes, expired }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'refresh-cache') {
      // Called by cron job - fetches busy times for current + next week and caches them
      const { data: connections, error: connErr } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_connected', true)
        .in('owner_type', ['practitioner', 'main', 'room']);

      if (connErr || !connections?.length) {
        console.log('No calendar connections to refresh cache for');
        return new Response(
          JSON.stringify({ success: true, cached: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Cache current week and next week
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + mondayOffset);
      thisMonday.setHours(0, 0, 0, 0);
      
      const weeks = [];
      for (let i = 0; i < 5; i++) {
        const w = new Date(thisMonday);
        w.setDate(thisMonday.getDate() + i * 7);
        weeks.push(w);
      }
      let cached = 0;

      for (const weekStart of weeks) {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        
        // Hawaii is UTC-10: add 10 hours to cover full Hawaii day
        const timeMin = new Date(weekStart.getTime() + 10 * 60 * 60 * 1000).toISOString();
        const timeMax = new Date(weekEnd.getTime() + 10 * 60 * 60 * 1000 - 1000).toISOString();
        const weekStartStr = weekStart.toISOString().split('T')[0];

        const results = await Promise.allSettled(
          connections.map(async (connection) => {
            try {
              const accessToken = await refreshTokenIfNeeded(supabase, connection);

              const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id)}/events?` +
                new URLSearchParams({
                  timeMin,
                  timeMax,
                  singleEvents: 'true',
                  orderBy: 'startTime',
                  fields: 'items(summary,start,end)',
                }),
                {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                  },
                }
              );

              const data = await response.json();
              const busyTimes = (data.items || [])
                .filter((ev: any) => !isBirthdayEvent(ev.summary || ''))
                .map((ev: any) => ({
                start: ev.start?.dateTime || ev.start?.date,
                end: ev.end?.dateTime || ev.end?.date,
                summary: ev.summary || 'Busy',
              }));

              // Upsert into cache
              const { error: upsertErr } = await supabase
                .from('calendar_busy_cache')
                .upsert({
                  connection_id: connection.id,
                  owner_type: connection.owner_type,
                  owner_id: connection.owner_id,
                  week_start: weekStartStr,
                  busy_times: busyTimes,
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'connection_id,week_start' });

              if (upsertErr) {
                console.error('Cache upsert error for connection', connection.id, upsertErr);
              } else {
                cached++;
              }

              return { success: true };
            } catch (err: any) {
              console.error('Error refreshing cache for connection:', connection.id, err);
              return null;
            }
          })
        );
      }

      console.log(`Cache refreshed: ${cached} entries updated`);
      return new Response(
        JSON.stringify({ success: true, cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'invalidate-connection-cache') {
      // Clear and re-fetch cache for a specific connection after calendar change
      const invOwnerType = reqOwnerType;
      const invOwnerId = reqOwnerId;

      // Find the connection
      let connQuery = supabase
        .from('calendar_connections')
        .select('*')
        .eq('owner_type', invOwnerType)
        .eq('is_connected', true);
      
      if (invOwnerId) {
        connQuery = connQuery.eq('owner_id', invOwnerId);
      } else {
        connQuery = connQuery.is('owner_id', null);
      }

      const { data: conn } = await connQuery.maybeSingle();

      if (!conn) {
        return new Response(
          JSON.stringify({ success: false, error: 'Connection not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete all existing cache entries for this connection
      await supabase
        .from('calendar_busy_cache')
        .delete()
        .eq('connection_id', conn.id);

      console.log('Cleared cache for connection:', conn.id);

      // Re-fetch busy times for current week and next week
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + mondayOffset);
      thisMonday.setHours(0, 0, 0, 0);
      
      const nextMonday = new Date(thisMonday);
      nextMonday.setDate(thisMonday.getDate() + 7);

      const weeks = [thisMonday, nextMonday];
      let cached = 0;

      try {
        const accessToken = await refreshTokenIfNeeded(supabase, conn);

        for (const weekStart of weeks) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 7);
          
          const timeMin = new Date(weekStart.getTime() + 10 * 60 * 60 * 1000).toISOString();
          const timeMax = new Date(weekEnd.getTime() + 10 * 60 * 60 * 1000 - 1000).toISOString();
          const weekStartStr = weekStart.toISOString().split('T')[0];

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.google_calendar_id)}/events?` +
            new URLSearchParams({
              timeMin,
              timeMax,
              singleEvents: 'true',
              orderBy: 'startTime',
              fields: 'items(summary,start,end)',
            }),
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          const data = await response.json();
          const busyTimes = (data.items || [])
            .filter((ev: any) => !isBirthdayEvent(ev.summary || ''))
            .map((ev: any) => ({
            start: ev.start?.dateTime || ev.start?.date,
            end: ev.end?.dateTime || ev.end?.date,
            summary: ev.summary || 'Busy',
          }));

          await supabase
            .from('calendar_busy_cache')
            .upsert({
              connection_id: conn.id,
              owner_type: conn.owner_type,
              owner_id: conn.owner_id,
              week_start: weekStartStr,
              busy_times: busyTimes,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'connection_id,week_start' });

          cached++;
        }
      } catch (err: any) {
        console.error('Error re-fetching cache for connection:', conn.id, err);
      }

      console.log(`Cache invalidated and refreshed: ${cached} entries for connection ${conn.id}`);
      return new Response(
        JSON.stringify({ success: true, cached }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete-event') {
      // Delete an event from all connected calendars using per-calendar event IDs
      const { data: booking } = await supabase
        .from('bookings')
        .select('google_event_id, google_event_ids, practitioner_id, room_id')
        .eq('id', bookingId)
        .single();

      const eventIdsMap: Record<string, string> = (booking?.google_event_ids as Record<string, string>) || {};
      const legacyEventId = booking?.google_event_id;

      // If no event IDs at all, nothing to delete
      if (!legacyEventId && Object.keys(eventIdsMap).length === 0) {
        return new Response(
          JSON.stringify({ error: 'No calendar event to delete' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get all relevant connections
      const { data: connections } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_connected', true);

      for (const conn of connections || []) {
        // Use per-calendar event ID if available, fall back to legacy single ID
        const eventId = eventIdsMap[conn.id] || legacyEventId;
        if (!eventId) continue;

        try {
          const accessToken = await refreshTokenIfNeeded(supabase, conn);
          const delResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.google_calendar_id)}/events/${eventId}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );
          if (delResponse.ok || delResponse.status === 404 || delResponse.status === 410) {
            console.log(`Deleted event ${eventId} from ${conn.owner_type} calendar ${conn.id}`);
          } else {
            console.log(`Failed to delete event ${eventId} from ${conn.id}: ${delResponse.status}`);
          }
        } catch (e) {
          console.log('Event deletion error for connection', conn.id, e);
        }
      }

      // Clear event IDs from booking
      await supabase
        .from('bookings')
        .update({ google_event_id: null, google_event_ids: {} })
        .eq('id', bookingId);
      await debugLog(supabase, "google-calendar-sync:bookings.update", "Booking unlinked from Google events", { booking_id: bookingId });

      // Invalidate busy cache for all affected connections so calendar UI refreshes
      for (const conn of connections || []) {
        await supabase
          .from('calendar_busy_cache')
          .delete()
          .eq('connection_id', conn.id);
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'cleanup-orphaned-events') {
      const cleanupSummary = searchSummary || '';
      
      if (!cleanupSummary) {
        return new Response(
          JSON.stringify({ error: 'searchSummary is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: connections } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_connected', true);

      const deleted: string[] = [];

      for (const conn of connections || []) {
        try {
          const accessToken = await refreshTokenIfNeeded(supabase, conn);
          
          // Search for events with matching summary
          const params: Record<string, string> = {
            q: cleanupSummary,
            singleEvents: 'true',
            orderBy: 'startTime',
            maxResults: '50',
          };

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.google_calendar_id)}/events?` +
            new URLSearchParams(params),
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${accessToken}` },
            }
          );

          const data = await response.json();
          
          for (const event of data.items || []) {
            if (event.summary && event.summary.includes(cleanupSummary)) {
              const delRes = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.google_calendar_id)}/events/${event.id}`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${accessToken}` },
                }
              );
              deleted.push(`${conn.owner_type}:${conn.google_calendar_name}:${event.summary} (${delRes.status})`);
              console.log(`Deleted orphaned event "${event.summary}" from ${conn.owner_type} calendar`);
            }
          }
        } catch (e) {
          console.error('Cleanup error for connection', conn.id, e);
        }
      }

      // Invalidate all busy caches
      await supabase.from('calendar_busy_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      return new Response(
        JSON.stringify({ success: true, deleted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in google-calendar-sync:', error);
    
    // Handle TOKEN_EXPIRED specially for auto-reconnect
    if (error?.code === 'TOKEN_EXPIRED') {
      return new Response(
        JSON.stringify({ 
          error: error.message || 'Token expired', 
          code: 'TOKEN_EXPIRED',
          connectionId: error.connectionId 
        }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});

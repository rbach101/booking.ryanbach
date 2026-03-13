// Shared Google Calendar conflict-check logic for create-appointment and submit-booking.
// Import with: import { checkCalendarBusyConflict } from "../_shared/calendar.ts";

import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY");

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY || "");
  return await crypto.subtle.importKey(
    "raw",
    keyData.buffer as ArrayBuffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

export async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken.startsWith("enc:")) return encryptedToken;
  if (!TOKEN_ENCRYPTION_KEY) throw new Error("Encryption key not configured");
  const key = await getEncryptionKey();
  const combined = decodeBase64(encryptedToken.slice(4));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export async function refreshTokenIfNeeded(supabase: any, connection: any): Promise<string> {
  const expiryDate = new Date(connection.google_token_expiry);
  const now = new Date();
  if (expiryDate.getTime() - now.getTime() < 5 * 60 * 1000) {
    if (!connection.google_refresh_token) throw new Error("No refresh token");
    const decryptedRefreshToken = await decryptToken(connection.google_refresh_token);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: decryptedRefreshToken,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenResponse.json();
    if (tokenData.error) throw new Error("Token refresh failed");
    if (tokenData.access_token) {
      const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
      await supabase
        .from("calendar_connections")
        .update({
          google_access_token: tokenData.access_token,
          google_token_expiry: newExpiry.toISOString(),
        })
        .eq("id", connection.id);
      return tokenData.access_token;
    }
  }
  return await decryptToken(connection.google_access_token);
}

export type CalendarCheckReason = "ok" | "no_connection" | "busy_conflict" | "verification_failed";
export type CalendarCheckResult = { hasConflict: boolean; reason: CalendarCheckReason; summary?: string };

/** Log prefix for console output, e.g. "[CREATE-APPT]" or "[SUBMIT]" */
export type CalendarLogPrefix = string;

export async function checkCalendarBusyConflict(
  supabase: any,
  practitionerId: string,
  bookingDate: string,
  startTime: string,
  endTime: string,
  logPrefix: CalendarLogPrefix = "[CAL]"
): Promise<CalendarCheckResult> {
  try {
    const { data: connections } = await supabase
      .from("calendar_connections")
      .select("id, google_calendar_id, google_access_token, google_refresh_token, google_token_expiry")
      .eq("owner_type", "practitioner")
      .eq("owner_id", practitionerId)
      .eq("is_connected", true);

    if (!connections || connections.length === 0) return { hasConflict: false, reason: "no_connection" };

    const busyTimesToCheck: any[] = [];
    const dateParts = bookingDate.split("-").map(Number);
    const timeMin = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2], 10, 0, 0)).toISOString();
    const timeMax = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2] + 1, 9, 59, 59)).toISOString();

    console.log(`${logPrefix} LIVE calendar check for ${practitionerId} on ${bookingDate}`);

    for (const connection of connections) {
      if (!connection.google_calendar_id || !connection.google_access_token) continue;
      try {
        const accessToken = await refreshTokenIfNeeded(supabase, connection);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.google_calendar_id)}/events?` +
            new URLSearchParams({
              timeMin,
              timeMax,
              singleEvents: "true",
              orderBy: "startTime",
              fields: "items(summary,start,end,transparency,status)",
            }),
          {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          }
        );
        clearTimeout(timeout);

        if (response.ok) {
          const data = await response.json();
          const events = (data.items || []).map((ev: any) => ({
            start: ev.start?.dateTime || ev.start?.date,
            end: ev.end?.dateTime || ev.end?.date,
            summary: ev.summary || "Busy",
            transparency: ev.transparency || null,
            status: ev.status || null,
          }));
          busyTimesToCheck.push(...events);
          console.log(`${logPrefix} Live API returned ${events.length} events for ${practitionerId} on ${bookingDate}`);
        } else {
          const errText = await response.text();
          console.error(`${logPrefix} Live calendar API error for ${practitionerId}: ${response.status} ${errText}`);
          return { hasConflict: true, reason: "verification_failed", summary: "Unable to verify calendar availability" };
        }
      } catch (err: any) {
        console.error(`${logPrefix} Live calendar API failed for connection ${connection.id}:`, err?.message);
        return { hasConflict: true, reason: "verification_failed", summary: "Unable to verify calendar availability" };
      }
    }

    const bookingStartUtc = new Date(`${bookingDate}T${startTime}:00-10:00`).getTime();
    const bookingEndUtc = new Date(`${bookingDate}T${endTime}:00-10:00`).getTime();

    for (const busy of busyTimesToCheck) {
      const isAllDay = !String(busy.start).includes("T");

      if (isAllDay) {
        if (bookingDate >= busy.start && bookingDate < busy.end) {
          console.log(`${logPrefix} Calendar busy conflict (all-day "${busy.summary || "event"}") for practitioner ${practitionerId} on ${bookingDate}`);
          return { hasConflict: true, reason: "busy_conflict", summary: busy.summary || "All-day event" };
        }
      } else {
        if (busy.status === "cancelled") continue;
        if (busy.transparency === "transparent") continue;

        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        if (busyStart.getTime() < bookingEndUtc && busyEnd.getTime() > bookingStartUtc) {
          console.log(`${logPrefix} Calendar busy conflict ("${busy.summary || "event"}") for practitioner ${practitionerId} on ${bookingDate} ${startTime}-${endTime}`);
          return { hasConflict: true, reason: "busy_conflict", summary: busy.summary || "Calendar event" };
        }
      }
    }
    return { hasConflict: false, reason: "ok" };
  } catch (err) {
    console.error(`${logPrefix} Error checking calendar busy times:`, err);
    return { hasConflict: true, reason: "verification_failed", summary: "Unable to verify calendar availability" };
  }
}

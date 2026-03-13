// HMAC-signed deposit token for create-deposit-payment.
// Proves the request originated from a successful submit-booking.

import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

async function getHmacKey(): Promise<CryptoKey> {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/** Generate a signed token for a booking (call from submit-booking) */
export async function generateDepositToken(bookingId: string): Promise<string> {
  const payload = {
    bookingId,
    exp: Date.now() + EXPIRY_MS,
  };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadB64 = encodeBase64(payloadBytes.buffer as ArrayBuffer);

  const hmacKey = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", hmacKey, payloadBytes);
  const sigB64 = encodeBase64(sig as ArrayBuffer);

  return `${payloadB64}.${sigB64}`;
}

/** Verify token and return bookingId, or null if invalid/expired */
export async function verifyDepositToken(token: string): Promise<string | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;
    const payloadBytes = decodeBase64(payloadB64);
    const sigBytes = decodeBase64(sigB64);

    const hmacKey = await getHmacKey();
    const valid = await crypto.subtle.verify(
      "HMAC",
      hmacKey,
      sigBytes.buffer as ArrayBuffer,
      payloadBytes.buffer as ArrayBuffer
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (payload.exp < Date.now()) return null; // Expired
    if (!payload.bookingId || typeof payload.bookingId !== "string") return null;

    return payload.bookingId;
  } catch {
    return null;
  }
}

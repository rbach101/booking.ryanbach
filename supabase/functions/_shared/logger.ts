// Structured logging for edge functions.
// Outputs JSON for easy parsing in Supabase logs, Logflare, etc.

export type LogLevel = "info" | "warn" | "error";

export type LogEvent =
  | "auth_failed"
  | "auth_success"
  | "deposit_token_rejected"
  | "deposit_token_mismatch"
  | "payment_started"
  | "payment_success"
  | "payment_failed"
  | "booking_created"
  | "booking_conflict"
  | string;

function formatLog(level: LogLevel, event: LogEvent, source: string, details?: Record<string, unknown>): string {
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    source,
    ...(details && Object.keys(details).length > 0 && { details }),
  };
  return JSON.stringify(entry);
}

/** Log structured JSON to stdout */
export function logStructured(
  level: LogLevel,
  event: LogEvent,
  source: string,
  details?: Record<string, unknown>
): void {
  console.log(formatLog(level, event, source, details));
}

/** Shorthand for auth/security events (warn level) */
export function logAuthFailure(source: string, reason: string, details?: Record<string, unknown>): void {
  logStructured("warn", "auth_failed", source, { reason, ...details });
}

/** Shorthand for deposit token rejections */
export function logDepositTokenRejected(source: string, reason: string, details?: Record<string, unknown>): void {
  logStructured("warn", "deposit_token_rejected", source, { reason, ...details });
}

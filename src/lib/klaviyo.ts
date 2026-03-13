/**
 * Klaviyo tracking utility
 * Wraps the global klaviyo object for type-safe event tracking.
 * Events sent here will appear in Klaviyo and can trigger SMS/email flows.
 */

declare global {
  interface Window {
    klaviyo?: {
      identify: (properties: KlaviyoProfile) => Promise<void>;
      track: (event: string, properties?: Record<string, unknown>) => Promise<void>;
      push: (...args: unknown[]) => void;
    };
  }
}

interface KlaviyoProfile {
  $email?: string;
  $first_name?: string;
  $last_name?: string;
  $phone_number?: string;
  [key: string]: unknown;
}

function getKlaviyo() {
  return window.klaviyo;
}

/** Identify a customer profile in Klaviyo */
export function klaviyoIdentify(profile: KlaviyoProfile) {
  const kl = getKlaviyo();
  if (!kl) return;
  try {
    kl.identify(profile);
  } catch (e) {
    console.warn('Klaviyo identify error:', e);
  }
}

/** Track a custom event in Klaviyo */
export function klaviyoTrack(event: string, properties?: Record<string, unknown>) {
  const kl = getKlaviyo();
  if (!kl) return;
  try {
    kl.track(event, properties);
  } catch (e) {
    console.warn('Klaviyo track error:', e);
  }
}

// ── Pre-built event helpers ──

export function trackBookingSubmitted(data: {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  totalAmount?: number | null;
  balanceDue?: number | null;
  practitionerName?: string | null;
}) {
  // Identify the customer so Klaviyo can build a profile
  const nameParts = data.clientName.split(' ');
  klaviyoIdentify({
    $email: data.clientEmail,
    $first_name: nameParts[0] || '',
    $last_name: nameParts.slice(1).join(' ') || '',
    $phone_number: data.clientPhone || undefined,
  });

  klaviyoTrack('Booking Submitted', {
    BookingId: data.bookingId,
    ServiceName: data.serviceName,
    BookingDate: data.bookingDate,
    StartTime: data.startTime,
    TotalAmount: data.totalAmount,
    BalanceDue: data.balanceDue,
    PractitionerName: data.practitionerName,
  });
}

export function trackCheckIn(data: {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  practitionerName?: string | null;
}) {
  const nameParts = data.clientName.split(' ');
  klaviyoIdentify({
    $email: data.clientEmail,
    $first_name: nameParts[0] || '',
    $last_name: nameParts.slice(1).join(' ') || '',
    $phone_number: data.clientPhone || undefined,
  });

  klaviyoTrack('Client Checked In', {
    BookingId: data.bookingId,
    ServiceName: data.serviceName,
    BookingDate: data.bookingDate,
    StartTime: data.startTime,
    PractitionerName: data.practitionerName,
  });
}

export function trackBookingApproved(data: {
  bookingId: string;
  clientName: string;
  clientEmail: string;
  clientPhone?: string | null;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  practitionerName?: string | null;
}) {
  const nameParts = data.clientName.split(' ');
  klaviyoIdentify({
    $email: data.clientEmail,
    $first_name: nameParts[0] || '',
    $last_name: nameParts.slice(1).join(' ') || '',
    $phone_number: data.clientPhone || undefined,
  });

  klaviyoTrack('Booking Approved', {
    BookingId: data.bookingId,
    ServiceName: data.serviceName,
    BookingDate: data.bookingDate,
    StartTime: data.startTime,
    PractitionerName: data.practitionerName,
  });
}

export function trackBookingCancelled(data: {
  bookingId: string;
  clientEmail: string;
  serviceName: string;
  bookingDate: string;
}) {
  klaviyoIdentify({ $email: data.clientEmail });

  klaviyoTrack('Booking Cancelled', {
    BookingId: data.bookingId,
    ServiceName: data.serviceName,
    BookingDate: data.bookingDate,
  });
}

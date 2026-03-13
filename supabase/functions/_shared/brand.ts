// Single source of truth for brand identity across all edge functions.
// Import with: import { BRAND } from "../_shared/brand.ts";

export const BRAND = {
  name: "Custom Booking",
  supportEmail: "booking@support.thedigitaldocs.com",
  bookingsEmail: "booking@support.thedigitaldocs.com",
  address: "123 Main St, City, ST 12345",
  siteUrl: "https://booking.ryanbach.tech",
  primaryColor: "#6b8f71",

  /** Resend "from" for transactional / notification emails */
  fromSupport: "Custom Booking <booking@support.thedigitaldocs.com>",
  /** Resend "from" for booking-related emails */
  fromBookings: "Custom Booking <booking@support.thedigitaldocs.com>",

  /** Standard HTML email footer */
  emailFooterHtml: `
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
      <p style="margin: 4px 0;">Custom Booking</p>
      <p style="margin: 4px 0;">123 Main St, City, ST 12345</p>
      <p style="margin: 4px 0;">booking@support.thedigitaldocs.com</p>
    </div>`,

  /** Standard plain-text email footer */
  emailFooterText: `\n\n---\nCustom Booking\n123 Main St, City, ST 12345\nbooking@support.thedigitaldocs.com`,

  /** Hawaii General Excise Tax — Hawaii County (Big Island) passable rate 4.25% */
  hawaiiGetRate: 0.0425,

  /** Allowed CORS origins */
  allowedOrigins: [
    "https://booking.ryanbach.tech",
    "https://ryanbach.tech",
    "http://localhost:5173",
    "http://localhost:8080",
  ],
} as const;

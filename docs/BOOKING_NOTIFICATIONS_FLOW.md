# Booking Flow & Notifications

This document describes the booking flow, when notifications are sent, and how audit logging works.

## Booking Creation Paths

### 1. Public Booking (BookingWizard / embed)
- **Flow**: Client submits → `submit-booking` edge function
- **Status**: `pending_approval` (or `confirmed` if auto-approve)
- **Notifications**:
  - **Staff**: `notify-staff-booking` → Email + in-app to assigned practitioner(s), CC admin
  - **Client**: Confirmation page shown; no email until approved

### 2. Admin/Staff Booking (NewBookingDialog)
- **Flow**: Admin creates → `create-appointment` edge function
- **Status**: `pending_approval` or `confirmed` (based on requiresApproval)
- **Notifications**:
  - If `pending_approval`: `send-notification` (type: `approval_request`) → Practitioner(s) + admin
  - If `confirmed`: `send-notification` (type: `booking_confirmation`) → Client + staff

## Approval Flow

### Approve / Decline (approve-booking)
- **Flow**: Admin/staff approves or declines from dashboard
- **Notifications**: `send-notification` (type: `booking_confirmation` or `booking_declined`, recipientType: `both`)
  - Client: Email (+ SMS if consented)
  - Staff: Email + in-app to practitioner(s)
  - Admin: CC on staff email

### Reassign Practitioner (PendingApprovals)
- **Flow**: Admin clicks Reassign → finds next available practitioner → updates DB
- **Notifications**: `send-notification` (type: `booking_reassigned`, recipientType: `staff`)
  - New practitioner: Email + in-app notification

### Reschedule (PendingApprovals or BookingDetailsDialog)
- **Flow**: Admin changes date/time (and optionally practitioner)
- **Notifications**:
  - **PendingApprovals reschedule**: `notify-staff-booking` (reschedule: true) → Client email with updated details
  - **BookingDetailsDialog**: "Send notification" button → `notify-staff-booking` (reschedule: true) → Client email

## Post-Booking Events

### Check-in (CheckInPage)
- **Flow**: Client checks in on appointment day
- **Notifications**: `notify-checkin` → Practitioner + admin (SMS + email per settings)

### Reminders (send-reminders cron)
- **Flow**: Scheduled job runs before appointments
- **Notifications**: Email (+ SMS if consented) to client

### Payment / Tip (post-appointment-payment, etc.)
- **Flow**: Stripe webhooks, manual charges
- **Notifications**: Receipt emails, tip confirmation

## Audit Logging

Failed notifications are logged to `audit_logs` with:
- `action`: `notification_failed`
- `resource_type`: `booking`
- `resource_id`: booking ID
- `details`: `{ function, type, recipient, channel, attempts }`

Functions that log failures:
- `send-notification` (email failures)
- `notify-staff-booking` (email failures)
- `submit-booking` (staff notification failure)
- `send-reminders` (email failures)
- `notify-checkin` (SMS/email failures)
- `post-appointment-payment` (follow-up email failures)

## Notification Types (send-notification)

| Type | Recipient | Channels |
|------|-----------|----------|
| `approval_request` | Practitioner(s) + admin | Email, SMS (if consented), in-app |
| `booking_confirmation` | Client, staff | Email, SMS (client if consented), in-app (staff) |
| `booking_approved` | Client | Alias for `booking_confirmation` (used by quick-action links) |
| `booking_declined` | Client | Email, SMS (if consented) |
| `booking_reassigned` | New practitioner(s) | Email, in-app |

## Key Tables

- **notifications**: In-app notifications (bell icon)
- **sent_emails**: Email delivery log (from send-notification)
- **audit_logs**: Failed notifications, view events, etc.

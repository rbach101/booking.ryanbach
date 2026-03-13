## Booking conflict verification matrix (staging/local)

This is a small checklist to validate that edge-function prechecks match the DB trigger `prevent_overlapping_bookings()` and that couples/room logic behaves as expected.

### Preconditions
- Use a **staging** Supabase project (or a local Supabase instance).
- Pick two practitioners:
  - `P1` and `P2` (UUIDs)
- Pick one room:
  - `R1` (UUID)
- Pick a date:
  - `D = 2026-03-11` (or any future date)
- Use simple time blocks:
  - `T1 = 09:00`–`10:00`
  - `T2 = 09:30`–`10:30` (overlaps T1)
  - `T3 = 10:00`–`11:00` (touches boundary, should be allowed if end-exclusive)

### What to verify (expected outcomes)

#### A) Primary practitioner overlap (same practitioner_id)
1. Create booking (P1, R1, D, T1) → **OK**
2. Create booking (P1, R1, D, T2) → **BLOCKED** (practitioner conflict)
3. Create booking (P1, R1, D, T3) → **OK** (boundary-touching)

#### B) Couples overlap (practitioner appears as practitioner_2_id)
1. Create booking couples: (practitioner_id=P2, practitioner_2_id=P1, R1, D, T1) → **OK**
2. Attempt staff create-appointment with (practitioner_id=P1, D, T2) → **BLOCKED** (must detect P1 booked as practitioner_2_id)

#### C) Room overlap (different practitioners, same room)
1. Create booking (P1, R1, D, T1) → **OK**
2. Create booking (P2, R1, D, T2) → **BLOCKED** (room conflict)

#### D) Status semantics
1. Create booking (P1, R1, D, T1) with `status='cancelled'` → should **NOT** block overlaps
2. Create booking (P1, R1, D, T2) with `status='completed'` → **does block** overlaps (per DB trigger: only `cancelled` is ignored)

### Notes
- The DB trigger uses strict overlap: `start_time < NEW.end_time AND end_time > NEW.start_time` (end-exclusive).
- If you observe any case where edge function prechecks allow a booking but the DB insert fails with `23505`, it indicates a precheck/DB mismatch.
- Google Calendar checks add a second “busy” dimension that is not enforced by the DB. Verify calendar behavior separately using a connected test calendar with:\n  - a transparent event (should not block)\n  - a cancelled event (should not block)\n  - an event spanning midnight (should block if it overlaps the booking window)


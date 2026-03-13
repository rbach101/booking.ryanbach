/**
 * Helpers for booking_payments to prevent duplicate pending deposits.
 * A booking should have at most one pending deposit at a time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function expirePendingDepositsForBooking(supabase: any, bookingId: string): Promise<number> {
  const { data: existing, error } = await supabase
    .from('booking_payments')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('type', 'deposit')
    .eq('status', 'pending');

  if (error || !existing?.length) return 0;

  const { error: updateErr } = await supabase
    .from('booking_payments')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('type', 'deposit')
    .eq('status', 'pending');

  return updateErr ? 0 : existing.length;
}

/**
 * When rescheduling: keep only the most recent pending deposit, expire the rest.
 * Returns the number of records expired.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deduplicatePendingDeposits(supabase: any, bookingId: string): Promise<number> {
  const { data: pending, error } = await supabase
    .from('booking_payments')
    .select('id, created_at')
    .eq('booking_id', bookingId)
    .eq('type', 'deposit')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error || !pending?.length || pending.length <= 1) return 0;

  // Keep the most recent (first), expire the rest
  const idsToExpire = pending.slice(1).map((p: { id: string }) => p.id);
  if (idsToExpire.length === 0) return 0;

  const { error: updateErr } = await supabase
    .from('booking_payments')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .in('id', idsToExpire);

  if (updateErr) {
    console.error('Failed to expire duplicate pending deposits:', updateErr);
    return 0;
  }
  return idsToExpire.length;
}

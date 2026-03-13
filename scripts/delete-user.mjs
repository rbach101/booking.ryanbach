#!/usr/bin/env node
/**
 * Fully delete a user and their practitioner record by email.
 * Handles: user_roles, profiles, practitioner, bookings (unassign), services (remove from practitioner_ids), auth user.
 * Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/delete-user.mjs doc@thedigitaldocs.com
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://egmawhvpifyppukfgsuv.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user.mjs <email>');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

// 1. Find practitioner by email (works even if auth user already deleted)
const { data: pract, error: practFindError } = await supabase
  .from('practitioners')
  .select('id, name, user_id')
  .eq('email', email)
  .maybeSingle();

if (practFindError) {
  console.error('Error finding practitioner:', practFindError.message);
  process.exit(1);
}

let userId = pract?.user_id;

// 2. Find auth user by email if we don't have user_id
if (!userId) {
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (!listError) {
    const user = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (user) userId = user.id;
  }
}

// 3. If we have a practitioner, fully delete them
if (pract) {
  const practId = pract.id;
  console.log(`Found practitioner: ${pract.name} (${practId})`);

  // 3a. Unassign from bookings (set practitioner_id and practitioner_2_id to null)
  await supabase.from('bookings').update({ practitioner_id: null }).eq('practitioner_id', practId);
  await supabase.from('bookings').update({ practitioner_2_id: null }).eq('practitioner_2_id', practId);
  console.log('Unassigned from bookings');

  // 3b. Remove from services.practitioner_ids
  const { data: services } = await supabase.from('services').select('id, practitioner_ids');
  for (const svc of services || []) {
    const ids = (svc.practitioner_ids || []).filter(id => id !== practId);
    if (ids.length !== (svc.practitioner_ids || []).length) {
      await supabase.from('services').update({ practitioner_ids: ids }).eq('id', svc.id);
    }
  }
  console.log('Removed from services');

  // 3c. Delete practitioner (CASCADE: availability_blocks, calendar_connections; SET NULL: soap_notes, waitlist)
  const { error: deletePractError } = await supabase.from('practitioners').delete().eq('id', practId);
  if (deletePractError) {
    console.error('Error deleting practitioner:', deletePractError.message);
    process.exit(1);
  }
  console.log('Deleted practitioner record');
}

// 4. Delete auth user if we have one
if (userId) {
  console.log(`Deleting auth user: ${userId}`);

  await supabase.from('user_roles').delete().eq('user_id', userId);
  await supabase.from('profiles').delete().eq('id', userId);

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error('Error deleting auth user:', deleteError.message);
    process.exit(1);
  }
  console.log('Deleted auth user');
} else if (!pract) {
  console.error(`No user or practitioner found with email: ${email}`);
  process.exit(1);
}

console.log(`\nFully removed: ${email}`);

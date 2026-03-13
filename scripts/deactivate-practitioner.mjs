#!/usr/bin/env node
/**
 * Deactivate a practitioner by email (removes from dashboard).
 * Use when auth user was already deleted but practitioner still shows.
 * Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/deactivate-practitioner.mjs doc@thedigitaldocs.com
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://egmawhvpifyppukfgsuv.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/deactivate-practitioner.mjs <email>');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const { data, error } = await supabase
  .from('practitioners')
  .update({ user_id: null, is_active: false })
  .eq('email', email)
  .select('id, name, email');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

if (!data?.length) {
  console.error(`No practitioner found with email: ${email}`);
  process.exit(1);
}

console.log(`Deactivated: ${data[0].name} (${data[0].email})`);
console.log('They will no longer appear on the dashboard.');

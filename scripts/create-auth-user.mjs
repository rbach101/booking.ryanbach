#!/usr/bin/env node
/**
 * One-time script to create an auth user in Supabase.
 * Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/create-auth-user.mjs
 * Or add SUPABASE_SERVICE_ROLE_KEY to .env.local and run: node scripts/create-auth-user.mjs
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://egmawhvpifyppukfgsuv.supabase.co';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Get it from Supabase Dashboard > Settings > API > service_role');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const email = 'ryan.bach91@gmail.com';
const password = 'Custombooking101#';

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

const userId = data.user?.id;
console.log('User created:', data.user?.email);
console.log('ID:', userId);

// Assign admin role in user_roles table
const { error: roleError } = await supabase.from('user_roles').insert({
  user_id: userId,
  role: 'admin',
});

if (roleError) {
  console.error('Failed to assign admin role:', roleError.message);
  process.exit(1);
}

console.log('Admin role assigned.');

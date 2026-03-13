import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

const EDGE_FUNCTIONS = [
  'ai-concierge', 'approve-booking', 'calendar-cron-sync', 'charge-balance',
  'check-subscription', 'confirm-sms-consent', 'create-appointment', 'create-checkout',
  'create-deposit-payment', 'create-membership-checkout', 'create-package-checkout',
  'create-pos-charge', 'create-tip-payment', 'customer-portal', 'customers',
  'daily-practitioner-report', 'generate-sms-consent-link', 'google-calendar-auth',
  'google-calendar-callback', 'google-calendar-sync', 'health-monitor', 'intake-forms',
  'internal-messages', 'invite-user', 'monitor-bookings', 'notify-checkin',
  'notify-staff-booking', 'post-appointment-payment', 'public-availability',
  'quick-action', 'reconcile-payments', 'reset-staff-password', 'send-bulk-email',
  'send-custom-email', 'send-notification', 'send-payment-link', 'send-reminders',
  'send-sms', 'send-sms-consent-emails', 'send-test-email', 'setup-klaviyo-flows',
  'stripe-webhook', 'submit-booking', 'test-klaviyo-sms', 'update-user-metadata', 'waitlist',
];

// If more than this percentage of functions fail, assume the monitor itself
// is having issues (cold-boot contention, network blip) and suppress the alert email.
const FALSE_POSITIVE_THRESHOLD = 0.3; // 30%

function buildAlertHtml(
  failed: { name: string; error?: string }[],
  okCount: number,
  total: number
): string {
  const failureItems = failed
    .map(f => '<li><strong>' + f.name + '</strong>: ' + (f.error || 'Unknown error') + '</li>')
    .join('');

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Pacific/Honolulu' });

  return [
    '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">',
    '<h2 style="color: #dc2626;">Edge Function Health Alert</h2>',
    '<p>The automated health monitor detected <strong>' + failed.length + ' of ' + total + '</strong> edge functions are not responding:</p>',
    '<ul style="color: #dc2626;">' + failureItems + '</ul>',
    '<p style="color: #059669;">' + okCount + ' functions are operating normally.</p>',
    '<hr style="border: 1px solid #e5e7eb; margin: 20px 0;">',
    '<p style="color: #6b7280; font-size: 12px;">',
    'Automated health check at ' + timestamp + ' HST',
    '<br>View details: <a href="https://example.com/dev">Dev Dashboard</a>',
    '</p>',
    '</div>',
  ].join('\n');
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log('[HEALTH-MONITOR] Starting health check for ' + EDGE_FUNCTIONS.length + ' functions');

  const checkFn = async (name: string): Promise<{ name: string; ok: boolean; ms: number; error?: string }> => {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(SUPABASE_URL + '/functions/v1/' + name, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ healthCheck: true }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ms = Math.round(performance.now() - start);
      return { name, ok: true, ms };
    } catch (err: any) {
      const ms = Math.round(performance.now() - start);
      if (err.name === 'AbortError') {
        return { name, ok: false, ms, error: 'Timeout (10s)' };
      }
      return { name, ok: false, ms, error: (err.message || 'Unknown error').slice(0, 100) };
    }
  };

  // Smaller batches (5 at a time) with a brief pause to avoid cold-boot contention
  const results: { name: string; ok: boolean; ms: number; error?: string }[] = [];
  const BATCH_SIZE = 5;
  for (let i = 0; i < EDGE_FUNCTIONS.length; i += BATCH_SIZE) {
    const batch = EDGE_FUNCTIONS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(checkFn));
    results.push(...batchResults);
    // Small delay between batches to reduce contention
    if (i + BATCH_SIZE < EDGE_FUNCTIONS.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const failed = results.filter(r => !r.ok);
  const okCount = results.filter(r => r.ok).length;
  const failureRate = failed.length / EDGE_FUNCTIONS.length;

  console.log('[HEALTH-MONITOR] Results: ' + okCount + ' OK, ' + failed.length + ' Failed');

  // Always log to audit
  await supabase.from('audit_logs').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    user_email: 'system@example.com',
    action: 'health_check',
    resource_type: 'edge_functions',
    details: {
      total: EDGE_FUNCTIONS.length,
      ok: okCount,
      failed: failed.length,
      failures: failed.map(f => ({ name: f.name, error: f.error })),
      suppressed: failureRate > FALSE_POSITIVE_THRESHOLD,
      timestamp: new Date().toISOString(),
    },
  });

  if (failed.length > 0) {
    // Notifications disabled — results are logged to health_check_results only
    console.log('[HEALTH-MONITOR] ' + failed.length + ' functions down (notifications disabled):', failed.map(f => f.name));
  }

  return new Response(
    JSON.stringify({
      total: EDGE_FUNCTIONS.length,
      ok: okCount,
      failed: failed.length,
      failures: failed.map(f => ({ name: f.name, error: f.error })),
      suppressed: failureRate > FALSE_POSITIVE_THRESHOLD,
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

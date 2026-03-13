import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const b = await req.clone().json();
    if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch {}

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const token = authHeader.replace('Bearer ', '');
  const { data: { user: requestingUser }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !requestingUser) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', requestingUser.id);
  const isAdmin = roles?.some(r => r.role === 'admin');
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Only admins can delete practitioners' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { practitionerId } = await req.json();
  if (!practitionerId) {
    return new Response(JSON.stringify({ error: 'practitionerId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: pract, error: practError } = await supabase.from('practitioners').select('id, name, email, user_id').eq('id', practitionerId).single();
  if (practError || !pract) {
    return new Response(JSON.stringify({ error: 'Practitioner not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 1. Unassign from bookings
  await supabase.from('bookings').update({ practitioner_id: null }).eq('practitioner_id', pract.id);
  await supabase.from('bookings').update({ practitioner_2_id: null }).eq('practitioner_2_id', pract.id);

  // 2. Remove from services.practitioner_ids
  const { data: services } = await supabase.from('services').select('id, practitioner_ids');
  for (const svc of services || []) {
    const ids = (svc.practitioner_ids || []).filter((id: string) => id !== pract.id);
    if (ids.length !== (svc.practitioner_ids || []).length) {
      await supabase.from('services').update({ practitioner_ids: ids }).eq('id', svc.id);
    }
  }

  // 3. Delete practitioner (CASCADE handles availability_blocks, calendar_connections)
  const { error: deletePractError } = await supabase.from('practitioners').delete().eq('id', pract.id);
  if (deletePractError) {
    console.error('Delete practitioner error:', deletePractError);
    return new Response(JSON.stringify({ error: deletePractError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // 4. Delete auth user if linked
  if (pract.user_id) {
    await supabase.from('user_roles').delete().eq('user_id', pract.user_id);
    await supabase.from('profiles').delete().eq('id', pract.user_id);
    await supabase.auth.admin.deleteUser(pract.user_id);
  }

  return new Response(JSON.stringify({ success: true, message: `${pract.name} has been permanently deleted` }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

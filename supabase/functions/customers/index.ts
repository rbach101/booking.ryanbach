import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

/** Escape % and _ for safe use in Postgres ilike (prevents wildcard injection) */
function escapeIlike(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with user's token to verify identity
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for database operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user has admin or staff role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const userRoles = roles?.map(r => r.role) || [];
    const isAuthorized = userRoles.includes('admin') || userRoles.includes('staff');

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, ...data } = await req.json();
    console.log('Customers action:', action);

    // LIST customers
    if (action === 'list') {
      const { search, limit = 50, offset = 0 } = data;
      
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search && typeof search === 'string') {
        const safe = escapeIlike(search.trim().slice(0, 100));
        if (safe) query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
      }

      const { data: customers, error, count } = await query;

      if (error) {
        console.error('List error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch customers' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ customers, total: count }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET single customer
    if (action === 'get') {
      const { id } = data;
      
      const { data: customer, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Customer not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Also get their booking history
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id,
          booking_date,
          start_time,
          end_time,
          status,
          services:service_id(name),
          practitioners:practitioner_id(name)
        `)
        .eq('customer_id', id)
        .order('booking_date', { ascending: false })
        .limit(10);

      return new Response(
        JSON.stringify({ customer, bookings: bookings || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CREATE customer
    if (action === 'create') {
      const { firstName, lastName, email, phone, notes } = data;

      if (!firstName || !lastName || !email) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: firstName, lastName, email' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: customer, error } = await supabase
        .from('customers')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
          notes: notes?.trim() || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Create error:', error);
        if (error.code === '23505') {
          return new Response(
            JSON.stringify({ error: 'A customer with this email already exists' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'Failed to create customer' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Customer created:', customer.id);
      return new Response(
        JSON.stringify({ success: true, customer }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // UPDATE customer
    if (action === 'update') {
      const { id, firstName, lastName, email, phone, notes } = data;

      if (!id) {
        return new Response(
          JSON.stringify({ error: 'Customer ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const updates: Record<string, any> = {};
      if (firstName) updates.first_name = firstName.trim();
      if (lastName) updates.last_name = lastName.trim();
      if (email) updates.email = email.trim().toLowerCase();
      if (phone !== undefined) updates.phone = phone?.trim() || null;
      if (notes !== undefined) updates.notes = notes?.trim() || null;

      const { data: customer, error } = await supabase
        .from('customers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Update error:', error);
        if (error.code === '23505') {
          return new Response(
            JSON.stringify({ error: 'A customer with this email already exists' }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'Failed to update customer' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Customer updated:', customer.id);
      return new Response(
        JSON.stringify({ success: true, customer }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE customer (admin only - already enforced by RLS)
    if (action === 'delete') {
      const { id } = data;

      if (!userRoles.includes('admin')) {
        return new Response(
          JSON.stringify({ error: 'Only admins can delete customers' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to delete customer' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Customer deleted:', id);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SEARCH for quick lookup (autocomplete)
    if (action === 'search') {
      const { query: searchQuery } = data;
      
      if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 2) {
        return new Response(
          JSON.stringify({ customers: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const safe = escapeIlike(searchQuery.trim().slice(0, 100));
      const { data: customers } = await supabase
        .from('customers')
        .select('id, first_name, last_name, email, phone')
        .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`)
        .limit(10);

      return new Response(
        JSON.stringify({ customers: customers || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Customers error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface MessageRequest {
  action: 'send' | 'list' | 'mark-read';
  recipientId?: string | null;
  content?: string;
  bookingId?: string;
  messageId?: string;
}

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
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check user role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const userRoles = roles?.map(r => r.role) || [];
    if (!userRoles.includes('admin') && !userRoles.includes('staff')) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, recipientId, content, bookingId, messageId }: MessageRequest = await req.json();

    if (action === 'send') {
      if (!content) {
        return new Response(
          JSON.stringify({ error: 'Message content is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: message, error: insertError } = await supabase
        .from('internal_messages')
        .insert({
          sender_id: user.id,
          recipient_id: recipientId || null,
          content,
          booking_id: bookingId || null
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ error: 'Failed to send message' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create notification for recipient
      if (recipientId) {
        await supabase
          .from('notifications')
          .insert({
            user_id: recipientId,
            type: 'message',
            title: 'New Message',
            message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            action_url: '/messages'
          });
      }

      return new Response(
        JSON.stringify({ success: true, message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list') {
      // Fetch messages without embedded joins (no FK relationship)
      const { data: messages, error: listError } = await supabase
        .from('internal_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id},recipient_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (listError) {
        console.error('List error:', listError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch messages' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch profiles for senders and recipients
      const userIds = new Set<string>();
      messages?.forEach(m => {
        if (m.sender_id) userIds.add(m.sender_id);
        if (m.recipient_id) userIds.add(m.recipient_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .in('id', Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Attach profile info to messages
      const enrichedMessages = messages?.map(m => ({
        ...m,
        sender: m.sender_id ? profileMap.get(m.sender_id) || null : null,
        recipient: m.recipient_id ? profileMap.get(m.recipient_id) || null : null
      }));

      return new Response(
        JSON.stringify({ success: true, messages: enrichedMessages }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'mark-read') {
      if (!messageId) {
        return new Response(
          JSON.stringify({ error: 'Message ID is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateError } = await supabase
        .from('internal_messages')
        .update({ is_read: true })
        .eq('id', messageId)
        .or(`recipient_id.eq.${user.id},recipient_id.is.null`);

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to mark message as read' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in internal-messages:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

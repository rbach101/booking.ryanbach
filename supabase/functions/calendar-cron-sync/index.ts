import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

// Decryption utility
async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken.startsWith('enc:')) {
    return encryptedToken;
  }
  
  if (!TOKEN_ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }
  
  try {
    const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const combined = decodeBase64(encryptedToken.slice(4));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt token');
  }
}

// Encryption utility
async function encryptToken(token: string): Promise<string> {
  if (!TOKEN_ENCRYPTION_KEY) {
    return token;
  }
  
  try {
    const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedToken = new TextEncoder().encode(token);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedToken
    );
    
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    const { encode: encodeBase64 } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    return 'enc:' + encodeBase64(combined.buffer as ArrayBuffer);
  } catch (error) {
    console.error('Encryption error:', error);
    return token;
  }
}

async function attemptTokenRefresh(connection: any): Promise<{ success: boolean; accessToken?: string; tokenData?: any; error?: string }> {
  if (!connection.google_refresh_token) {
    return { success: false, error: 'No refresh token' };
  }
  
  try {
    const decryptedRefreshToken = await decryptToken(connection.google_refresh_token);
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: decryptedRefreshToken,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      return { success: false, error: tokenData.error_description || tokenData.error };
    }
    
    return { success: true, accessToken: tokenData.access_token, tokenData };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

async function refreshToken(supabase: any, connection: any): Promise<{ success: boolean; accessToken?: string; error?: string }> {
  // First attempt
  const firstAttempt = await attemptTokenRefresh(connection);
  
  if (firstAttempt.success) {
    // Save the refreshed token
    const tokenData = firstAttempt.tokenData;
    const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    const encryptedAccessToken = await encryptToken(tokenData.access_token);
    
    const updateData: any = {
      google_access_token: encryptedAccessToken,
      google_token_expiry: newExpiry.toISOString(),
      last_synced_at: new Date().toISOString(),
    };
    
    if (tokenData.refresh_token) {
      updateData.google_refresh_token = await encryptToken(tokenData.refresh_token);
    }
    
    await supabase
      .from('calendar_connections')
      .update(updateData)
      .eq('id', connection.id);
    
    console.log(`Token refreshed for connection ${connection.id}, new expiry: ${newExpiry.toISOString()}`);
    return { success: true, accessToken: tokenData.access_token };
  }
  
  // First attempt failed — wait 3 seconds and retry once
  console.warn(`First refresh attempt failed for ${connection.id}: ${firstAttempt.error}. Retrying in 3s...`);
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const secondAttempt = await attemptTokenRefresh(connection);
  
  if (secondAttempt.success) {
    const tokenData = secondAttempt.tokenData;
    const newExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    const encryptedAccessToken = await encryptToken(tokenData.access_token);
    
    const updateData: any = {
      google_access_token: encryptedAccessToken,
      google_token_expiry: newExpiry.toISOString(),
      last_synced_at: new Date().toISOString(),
    };
    
    if (tokenData.refresh_token) {
      updateData.google_refresh_token = await encryptToken(tokenData.refresh_token);
    }
    
    await supabase
      .from('calendar_connections')
      .update(updateData)
      .eq('id', connection.id);
    
    console.log(`Token refreshed on retry for connection ${connection.id}, new expiry: ${newExpiry.toISOString()}`);
    return { success: true, accessToken: tokenData.access_token };
  }
  
  // Both attempts failed — mark as disconnected and notify admins
  console.error(`Both refresh attempts failed for ${connection.id}: ${secondAttempt.error}`);
  
  await supabase
    .from('calendar_connections')
    .update({ is_connected: false })
    .eq('id', connection.id);
  
  // Determine the owner name for the notification
  let ownerName = 'Unknown';
  if (connection.owner_type === 'practitioner' && connection.owner_id) {
    const { data: practitioner } = await supabase
      .from('practitioners')
      .select('name')
      .eq('id', connection.owner_id)
      .maybeSingle();
    if (practitioner) ownerName = practitioner.name;
  } else if (connection.owner_type === 'room' && connection.owner_id) {
    const { data: room } = await supabase
      .from('rooms')
      .select('name')
      .eq('id', connection.owner_id)
      .maybeSingle();
    if (room) ownerName = room.name;
  } else if (connection.owner_type === 'main') {
    ownerName = 'Main Calendar';
  }
  
  // Notify all admin users
  const { data: adminRoles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  
  if (adminRoles && adminRoles.length > 0) {
    for (const adminRole of adminRoles) {
      await supabase
        .from('notifications')
        .insert({
          user_id: adminRole.user_id,
          type: 'calendar-disconnected',
          title: 'Calendar Disconnected',
          message: `${ownerName}'s Google Calendar was automatically disconnected because the token could not be refreshed. Please reconnect from Settings.`,
          action_url: '/settings',
        });
    }
    console.log(`Notified ${adminRoles.length} admin(s) about disconnected calendar for ${ownerName}`);
  }
  
  return { success: false, error: secondAttempt.error };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Health check fast path
    const body = await req.json().catch(() => ({}));
    if (body.healthCheck) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('Calendar Cron Sync started at:', new Date().toISOString());
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Get all active calendar connections
    const { data: connections, error: connError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('is_connected', true);
    
    if (connError) {
      throw new Error(`Failed to fetch connections: ${connError.message}`);
    }
    
    console.log(`Found ${connections?.length || 0} active calendar connections`);
    
    const results: { connectionId: string; ownerType: string; status: string; error?: string }[] = [];
    
    for (const connection of connections || []) {
      const expiryDate = new Date(connection.google_token_expiry);
      const now = new Date();
      const expiresInMinutes = (expiryDate.getTime() - now.getTime()) / (1000 * 60);
      
      console.log(`Connection ${connection.id} (${connection.owner_type}): expires in ${expiresInMinutes.toFixed(0)} minutes`);
      
      // Refresh if token expires in less than 30 minutes
      if (expiresInMinutes < 30) {
        console.log(`Refreshing token for connection ${connection.id}...`);
        const result = await refreshToken(supabase, connection);
        
        results.push({
          connectionId: connection.id,
          ownerType: connection.owner_type,
          status: result.success ? 'refreshed' : 'failed',
          error: result.error,
        });
      } else {
        // Just update last_synced_at to show we checked
        await supabase
          .from('calendar_connections')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', connection.id);
        
        results.push({
          connectionId: connection.id,
          ownerType: connection.owner_type,
          status: 'valid',
        });
      }
    }
    
    // Trigger cache refresh for all connections after token refresh
    try {
      console.log('Triggering busy time cache refresh...');
      const refreshResponse = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ action: 'refresh-cache' }),
      });
      const refreshData = await refreshResponse.json();
      console.log('Cache refresh result:', JSON.stringify(refreshData));
    } catch (cacheErr) {
      console.error('Cache refresh failed:', cacheErr);
    }

    // Also check for booking/practitioner conflicts
    const today = new Date().toISOString().split('T')[0];
    const { data: todayBookings } = await supabase
      .from('bookings')
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        practitioner_id,
        room_id,
        status,
        practitioners:practitioner_id(name, is_active),
        rooms:room_id(name, is_active)
      `)
      .gte('booking_date', today)
      .in('status', ['confirmed', 'pending']);
    
    const conflicts: { bookingId: string; issue: string }[] = [];
    
    for (const booking of todayBookings || []) {
      const practitioner = booking.practitioners as unknown as { name: string; is_active: boolean } | null;
      if (practitioner && !practitioner.is_active) {
        conflicts.push({
          bookingId: booking.id,
          issue: `Practitioner ${practitioner.name} is inactive`,
        });
      }
      
      const room = booking.rooms as unknown as { name: string; is_active: boolean } | null;
      if (room && !room.is_active) {
        conflicts.push({
          bookingId: booking.id,
          issue: `Room ${room.name} is inactive`,
        });
      }
    }
    
    if (conflicts.length > 0) {
      console.log('Found booking conflicts:', conflicts);
    }
    
    console.log('Calendar Cron Sync completed:', {
      connectionsChecked: results.length,
      refreshed: results.filter(r => r.status === 'refreshed').length,
      failed: results.filter(r => r.status === 'failed').length,
      conflicts: conflicts.length,
    });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        conflicts,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in calendar-cron-sync:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

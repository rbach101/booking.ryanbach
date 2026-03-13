import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64, decode as decodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { debugLog } from "../_shared/debugLog.ts";

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY');

// Encryption utilities using AES-GCM
async function getEncryptionKey(): Promise<CryptoKey> {
  const keyData = decodeBase64(TOKEN_ENCRYPTION_KEY || '');
  return await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptToken(token: string): Promise<string> {
  if (!TOKEN_ENCRYPTION_KEY) {
    console.warn('TOKEN_ENCRYPTION_KEY not set, storing token unencrypted');
    return token;
  }
  
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedToken = new TextEncoder().encode(token);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedToken
    );
    
    // Combine IV + encrypted data and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    return 'enc:' + encodeBase64(combined.buffer as ArrayBuffer);
  } catch (error) {
    console.error('Encryption error:', error);
    return token;
  }
}

async function decryptToken(encryptedToken: string): Promise<string> {
  // If not encrypted (no prefix), return as-is
  if (!encryptedToken.startsWith('enc:')) {
    return encryptedToken;
  }
  
  if (!TOKEN_ENCRYPTION_KEY) {
    console.error('TOKEN_ENCRYPTION_KEY not set, cannot decrypt');
    throw new Error('Encryption key not configured');
  }
  
  try {
    const key = await getEncryptionKey();
    const combined = decodeBase64(encryptedToken.slice(4)); // Remove 'enc:' prefix
    
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

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check fast path
  try { const b = await req.clone().json(); if (b?.healthCheck) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } catch {}

  try {
    // Authentication check - verify JWT token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use getClaims for JWT validation (works with Lovable Cloud ES256 signing)
    const token = authHeader.replace('Bearer ', '');
    const supabaseUser = createClient(SUPABASE_URL!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      console.error('Invalid or expired token:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Create a user-like object for compatibility
    const user = { id: claimsData.claims.sub as string };

    // Create service role client for database operations
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Verify user has admin or staff role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    const userRoles = roles?.map(r => r.role) || [];
    const isAuthorized = userRoles.includes('admin') || userRoles.includes('staff');
    
    if (!isAuthorized) {
      console.error('User lacks required role:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse body once - it can only be consumed once
    const body = await req.json();
    const { action, code, redirectUri, ownerType, ownerId, userId, accessToken, refreshToken, expiresAt, selectedCalendarId, selectedCalendarName, connectionId } = body;

    // Verify the userId matches the authenticated user
    if (userId && userId !== user.id) {
      console.error('UserId mismatch - attempted to act as another user');
      return new Response(
        JSON.stringify({ error: 'Forbidden - userId mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Google Calendar Auth action:', action, 'by user:', user.id);
    console.log('Redirect URI received:', redirectUri);

    if (action === 'get-auth-url') {
      // Generate OAuth URL for Google Calendar
      const scopes = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';

      const state = JSON.stringify({ ownerType, ownerId, userId: user.id });
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      console.log('Generated auth URL for:', ownerType, ownerId);

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-calendars') {
      // Get list of calendars after OAuth - used for calendar selection
      
      const calendarResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const calendarData = await calendarResponse.json();

      if (calendarData.error) {
        console.error('Calendar list error:', calendarData.error);
        return new Response(
          JSON.stringify({ error: calendarData.error.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return list of calendars user can write to
      const calendars = (calendarData.items || [])
        .filter((cal: any) => cal.accessRole === 'owner' || cal.accessRole === 'writer')
        .map((cal: any) => ({
          id: cal.id,
          summary: cal.summary,
          primary: cal.primary || false,
          backgroundColor: cal.backgroundColor,
        }));

      console.log('Found', calendars.length, 'writable calendars for user');

      return new Response(
        JSON.stringify({ calendars }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'exchange-code') {
      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID!,
          client_secret: GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error('Token exchange error:', tokenData.error);
        return new Response(
          JSON.stringify({ error: tokenData.error_description || tokenData.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return the access token so frontend can fetch calendar list
      // The frontend will then call save-connection with the selected calendar
      const expiryDate = new Date(Date.now() + tokenData.expires_in * 1000);
      
      return new Response(
        JSON.stringify({ 
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: expiryDate.toISOString(),
          ownerType,
          ownerId,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'save-connection') {
      // Save the calendar connection with the selected calendar ID
      // accessToken, refreshToken, expiresAt, selectedCalendarId already parsed from body above
      
      const expiryDate = new Date(expiresAt);

      // Encrypt tokens before storing
      const encryptedAccessToken = await encryptToken(accessToken);
      
      // First check if connection already exists to preserve existing refresh token if new one not provided
      let query = supabase
        .from('calendar_connections')
        .select('id, google_refresh_token')
        .eq('owner_type', ownerType);
      
      if (ownerId) {
        query = query.eq('owner_id', ownerId);
      } else {
        query = query.is('owner_id', null);
      }
      
      const { data: existingConnection } = await query.maybeSingle();

      // Google only returns refresh_token on first authorization OR when prompt=consent forces re-consent
      // If no new refresh token provided and we have an existing one, keep it
      let encryptedRefreshToken: string | null = null;
      if (refreshToken) {
        encryptedRefreshToken = await encryptToken(refreshToken);
        console.log('New refresh token received, encrypting');
      } else if (existingConnection?.google_refresh_token) {
        encryptedRefreshToken = existingConnection.google_refresh_token;
        console.log('No new refresh token, preserving existing one');
      } else {
        console.warn('No refresh token available - calendar connection may expire and require re-authorization');
      }

      console.log('Tokens encrypted successfully, saving with calendar:', selectedCalendarId);

      let data, error;
      
      const connectionData = {
        owner_type: ownerType,
        owner_id: ownerId || null,
        google_calendar_id: selectedCalendarId || 'primary',
        google_calendar_name: selectedCalendarName || null,
        google_access_token: encryptedAccessToken,
        google_refresh_token: encryptedRefreshToken,
        google_token_expiry: expiryDate.toISOString(),
        connected_by: user.id,
        is_connected: true,
        last_synced_at: new Date().toISOString(),
      };

      if (existingConnection) {
        // Update existing
        const result = await supabase
          .from('calendar_connections')
          .update(connectionData)
          .eq('id', existingConnection.id)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new
        const result = await supabase
          .from('calendar_connections')
          .insert(connectionData)
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Database error:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to save calendar connection' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      await debugLog(supabase, "google-calendar-auth:calendar_connections", existingConnection ? "Calendar connection updated" : "Calendar connection created", { connection_id: data.id });

      console.log('Calendar connected successfully:', data.id);

      return new Response(
        JSON.stringify({ success: true, connection: data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'refresh-token') {
      // Refresh an expired access token
      // connectionId already parsed from body above

      // Verify user has access to this connection
      const { data: connection } = await supabase
        .from('calendar_connections')
        .select('connected_by, google_refresh_token')
        .eq('id', connectionId)
        .single();

      if (!connection) {
        return new Response(
          JSON.stringify({ error: 'Connection not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Allow if user is the one who connected it, or is admin
      if (connection.connected_by !== user.id && !userRoles.includes('admin')) {
        return new Response(
          JSON.stringify({ error: 'Forbidden - not authorized to refresh this connection' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Decrypt the refresh token from DB if provided refreshToken is encrypted
      const decryptedRefreshToken = refreshToken 
        ? await decryptToken(refreshToken)
        : await decryptToken(connection.google_refresh_token);

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
        return new Response(
          JSON.stringify({ error: tokenData.error_description || tokenData.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const expiryDate = new Date(Date.now() + tokenData.expires_in * 1000);
      
      // Encrypt the new access token
      const encryptedAccessToken = await encryptToken(tokenData.access_token);

      // Update the connection
      await supabase
        .from('calendar_connections')
        .update({
          google_access_token: encryptedAccessToken,
          google_token_expiry: expiryDate.toISOString(),
        })
        .eq('id', connectionId);

      // Return the plaintext token for immediate use
      return new Response(
        JSON.stringify({ access_token: tokenData.access_token }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in google-calendar-auth:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

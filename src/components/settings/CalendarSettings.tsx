import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeRedirect } from '@/lib/safeRedirect';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Calendar, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { devLog } from '@/lib/logger';

interface CalendarConnection {
  id: string;
  owner_type: string;
  owner_id: string | null;
  google_calendar_id: string | null;
  google_calendar_name: string | null;
  is_connected: boolean;
  last_synced_at: string | null;
  connected_by: string | null;
  google_token_expiry: string | null;
}

interface CalendarEntity {
  id: string;
  name: string;
  type: 'practitioner' | 'room' | 'main';
  connection?: CalendarConnection;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor?: string;
}

interface PendingConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  ownerType: string;
  ownerId: string | null;
  entityName: string;
}

export function CalendarSettings() {
  const { user, isAdmin } = useAuth();
  const [entities, setEntities] = useState<CalendarEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [changingCalendar, setChangingCalendar] = useState<string | null>(null);
  
  // Calendar selection state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);
  const [isChangingExisting, setIsChangingExisting] = useState(false);

  const fetchData = async () => {
    try {
      // Fetch practitioners
      const { data: practitioners } = await supabase
        .from('practitioners')
        .select('id, name')
        .eq('is_active', true);

      // Fetch rooms
      const { data: rooms } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true);

      // Fetch calendar connections
      const { data: connections } = await supabase
        .from('calendar_connections')
        .select('*');

      const allEntities: CalendarEntity[] = [];

      // Main booking calendar (only shown to admins)
      if (isAdmin) {
        const mainConnection = connections?.find(c => c.owner_type === 'main');
        allEntities.push({
          id: 'main',
          name: 'Main Booking Calendar',
          type: 'main',
          connection: mainConnection,
        });
      }

      // Practitioners
      practitioners?.forEach(p => {
        const conn = connections?.find(c => c.owner_type === 'practitioner' && c.owner_id === p.id);
        allEntities.push({
          id: p.id,
          name: p.name,
          type: 'practitioner',
          connection: conn,
        });
      });

      // Rooms
      rooms?.forEach(r => {
        const conn = connections?.find(c => c.owner_type === 'room' && c.owner_id === r.id);
        allEntities.push({
          id: r.id,
          name: r.name,
          type: 'room',
          connection: conn,
        });
      });

      setEntities(allEntities);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load calendar settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Handle OAuth callback - Google returns 'code' and 'state' params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    devLog('CalendarSettings mount - URL search:', window.location.search);
    devLog('OAuth params - code:', code ? 'present' : 'null', 'state:', state ? 'present' : 'null');

    if (error) {
      devLog('OAuth error:', error);
      toast.error(`Calendar connection failed: ${error}`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (code && state) {
      devLog('Calling handleOAuthCallback with code and state');
      handleOAuthCallback(code, state);
    }
  }, [isAdmin]);

  // Auto-refresh expired tokens on page load (silent, no redirect)
  useEffect(() => {
    if (loading || entities.length === 0) return;
    
    const expiredConnections = entities.filter(
      entity => entity.connection?.is_connected && isTokenExpired(entity.connection)
    );
    
    if (expiredConnections.length > 0) {
      // Try silent refresh for the first expired connection
      const firstExpired = expiredConnections[0];
      toast.info(`Attempting to refresh token for ${firstExpired.name}...`);
      setTimeout(() => {
        refreshExpiredToken(firstExpired);
      }, 1000);
    }
  }, [loading, entities]);

  // Published URL for Google OAuth redirect - must match Google Cloud Console
  const PUBLISHED_URL = import.meta.env.VITE_APP_URL || 'https://booking.ryanbach.tech';

  const handleOAuthCallback = async (code: string, state: string) => {
    try {
      const stateData = JSON.parse(state);
      // Must match the redirect URI used in connectCalendar - always use published URL
      const redirectUri = `${PUBLISHED_URL}/settings`;

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();

      // Exchange code for tokens
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'exchange-code',
          code,
          redirectUri,
          ownerType: stateData.ownerType,
          ownerId: stateData.ownerId,
          userId: stateData.userId,
        },
      });

      if (error) throw error;

      // Find the entity name for the dialog
      const entityName = stateData.ownerType === 'main' 
        ? 'Main Booking Calendar'
        : entities.find(e => e.id === stateData.ownerId)?.name || 'Calendar';

      // Now fetch available calendars
      const { data: calendarData, error: calError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'get-calendars',
          accessToken: data.accessToken,
        },
      });

      if (calError) throw calError;

      // Store pending connection data and show calendar picker
      setPendingConnection({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        ownerType: stateData.ownerType,
        ownerId: stateData.ownerId,
        entityName,
      });
      setAvailableCalendars(calendarData.calendars || []);
      
      // Pre-select primary calendar if available
      const primaryCal = calendarData.calendars?.find((c: GoogleCalendar) => c.primary);
      setSelectedCalendarId(primaryCal?.id || calendarData.calendars?.[0]?.id || '');
      
      setShowCalendarPicker(true);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      console.error('OAuth callback error:', error);
      toast.error('Failed to complete calendar connection');
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const saveCalendarConnection = async () => {
    if (!pendingConnection || !selectedCalendarId) return;

    setSavingConnection(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const selectedCal = availableCalendars.find(c => c.id === selectedCalendarId);

      if (isChangingExisting) {
        // Just update the calendar ID and name for existing connection
        const updateData = { 
          google_calendar_id: selectedCalendarId,
          google_calendar_name: selectedCal?.summary || null,
        };

        if (pendingConnection.ownerId) {
          await supabase
            .from('calendar_connections')
            .update(updateData)
            .eq('owner_type', pendingConnection.ownerType)
            .eq('owner_id', pendingConnection.ownerId);
        } else {
          await supabase
            .from('calendar_connections')
            .update(updateData)
            .eq('owner_type', pendingConnection.ownerType)
            .is('owner_id', null);
        }
      } else {
        // New connection - save with tokens
        const { error } = await supabase.functions.invoke('google-calendar-auth', {
          headers: session?.access_token ? {
            Authorization: `Bearer ${session.access_token}`
          } : undefined,
          body: {
            action: 'save-connection',
            accessToken: pendingConnection.accessToken,
            refreshToken: pendingConnection.refreshToken,
            expiresAt: pendingConnection.expiresAt,
            selectedCalendarId,
            selectedCalendarName: selectedCal?.summary || null,
            ownerType: pendingConnection.ownerType,
            ownerId: pendingConnection.ownerId,
            userId: user?.id,
          },
        });

        if (error) throw error;
      }

      toast.success(`${isChangingExisting ? 'Changed to' : 'Connected to'} "${selectedCal?.summary || 'Calendar'}"`);
      
      // Invalidate cache and re-fetch from the new calendar immediately
      try {
        if (session?.access_token) {
          await supabase.functions.invoke('google-calendar-sync', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: {
              action: 'invalidate-connection-cache',
              ownerType: pendingConnection.ownerType,
              ownerId: pendingConnection.ownerId,
            },
          });
          toast.success('Calendar data refreshed');
        }
      } catch (cacheErr) {
        console.error('Cache invalidation error:', cacheErr);
      }

      setShowCalendarPicker(false);
      setPendingConnection(null);
      setAvailableCalendars([]);
      setIsChangingExisting(false);
      fetchData();
    } catch (error) {
      console.error('Save connection error:', error);
      toast.error('Failed to save calendar connection');
    } finally {
      setSavingConnection(false);
    }
  };

  const connectCalendar = async (entity: CalendarEntity) => {
    if (!user) return;

    setConnecting(entity.id);
    try {
      // Always use published URL for OAuth redirect - must match Google Cloud Console
      const redirectUri = `${PUBLISHED_URL}/settings`;
      devLog('Using redirect URI:', redirectUri);

      // Get current session for authorization
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'get-auth-url',
          redirectUri,
          ownerType: entity.type,
          ownerId: entity.type === 'main' ? null : entity.id,
          userId: user.id,
        },
      });

      if (error) throw error;

      // Redirect to Google OAuth
      safeRedirect(data.authUrl);
    } catch (error) {
      console.error('Connect error:', error);
      toast.error('Failed to initiate calendar connection');
      setConnecting(null);
    }
  };

  const disconnectCalendar = async (entity: CalendarEntity) => {
    if (!entity.connection) return;

    try {
      const { error } = await supabase
        .from('calendar_connections')
        .update({ is_connected: false })
        .eq('id', entity.connection.id);

      if (error) throw error;

      toast.success('Calendar disconnected');
      fetchData();
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect calendar');
    }
  };

  const changeCalendar = async (entity: CalendarEntity) => {
    if (!entity.connection) return;

    setChangingCalendar(entity.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // First refresh the token to get a valid access token
      const { data: refreshData, error: refreshError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'refresh-token',
          connectionId: entity.connection.id,
        },
      });

      // Check for token expired - auto trigger reconnect
      if (refreshData?.code === 'TOKEN_EXPIRED' || refreshError) {
        toast.info('Token expired. Reconnecting to Google Calendar...');
        setChangingCalendar(null);
        // Trigger reconnect instead of showing error
        connectCalendar(entity);
        return;
      }

      // Now get the calendar list with the fresh token
      const { data: calendarData, error: calError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'get-calendars',
          accessToken: refreshData.access_token,
        },
      });

      if (calError) throw calError;

      // Set up for calendar change (reuse the picker dialog)
      setPendingConnection({
        accessToken: refreshData.access_token,
        refreshToken: '', // Not needed for change, we keep existing
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // Approximate
        ownerType: entity.type,
        ownerId: entity.type === 'main' ? null : entity.id,
        entityName: entity.name,
      });
      setAvailableCalendars(calendarData.calendars || []);
      
      // Pre-select current calendar if in the list
      const currentCalId = entity.connection.google_calendar_id;
      const currentInList = calendarData.calendars?.find((c: GoogleCalendar) => c.id === currentCalId);
      setSelectedCalendarId(currentInList?.id || calendarData.calendars?.[0]?.id || '');
      
      setIsChangingExisting(true);
      setShowCalendarPicker(true);
    } catch (error: any) {
      console.error('Change calendar error:', error);
      // Check if error indicates token expired
      if (error?.message?.includes('expired') || error?.message?.includes('TOKEN_EXPIRED')) {
        toast.info('Token expired. Reconnecting to Google Calendar...');
        connectCalendar(entity);
      } else {
        toast.error('Failed to load calendars. You may need to reconnect.');
      }
    } finally {
      setChangingCalendar(null);
    }
  };

  // Try to silently refresh an expired token without requiring new OAuth
  const refreshExpiredToken = async (entity: CalendarEntity) => {
    if (!entity.connection) {
      connectCalendar(entity);
      return;
    }

    setConnecting(entity.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: refreshData, error: refreshError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'refresh-token',
          connectionId: entity.connection.id,
        },
      });

      if (refreshError || refreshData?.error) {
        devLog('Refresh failed, need full re-auth:', refreshError || refreshData?.error);
        toast.info('Refresh token expired. Redirecting to Google login...');
        connectCalendar(entity);
        return;
      }

      // Refresh succeeded!
      toast.success(`Token refreshed for ${entity.name}`);
      fetchData();
    } catch (error) {
      console.error('Refresh error:', error);
      toast.info('Could not refresh token. Redirecting to Google login...');
      connectCalendar(entity);
    } finally {
      setConnecting(null);
    }
  };

  const isTokenExpired = (connection?: CalendarConnection) => {
    if (!connection?.google_token_expiry) return false;
    const expiry = new Date(connection.google_token_expiry);
    return expiry < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Calendar Selection Dialog */}
      <Dialog open={showCalendarPicker} onOpenChange={(open) => {
        if (!open) {
          setShowCalendarPicker(false);
          setPendingConnection(null);
          setAvailableCalendars([]);
          setIsChangingExisting(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Google Calendar</DialogTitle>
            <DialogDescription>
              Choose which calendar to use for {pendingConnection?.entityName}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {availableCalendars.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No writable calendars found
              </p>
            ) : (
              <RadioGroup value={selectedCalendarId} onValueChange={setSelectedCalendarId}>
                <div className="space-y-3">
                  {availableCalendars.map((cal) => (
                    <div key={cal.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer" onClick={() => setSelectedCalendarId(cal.id)}>
                      <RadioGroupItem value={cal.id} id={cal.id} />
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: cal.backgroundColor || '#4285f4' }}
                      />
                      <Label htmlFor={cal.id} className="flex-1 cursor-pointer">
                        <span className="font-medium">{cal.summary}</span>
                        {cal.primary && (
                          <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setShowCalendarPicker(false);
              setPendingConnection(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={saveCalendarConnection}
              disabled={!selectedCalendarId || savingConnection}
            >
              {savingConnection ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Google Calendar Integration</CardTitle>
          <CardDescription>
            Connect Google Calendars for two-way sync. Each practitioner and room can have their own calendar, plus a main booking calendar for all appointments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {entities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No calendars to connect yet</p>
              <p className="text-sm mt-1">Add practitioners and rooms first, then return here to connect their calendars.</p>
            </div>
          ) : (
            entities.map((entity) => (
              <div
                key={`${entity.type}-${entity.id}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-muted/50 rounded-lg gap-3"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    entity.type === 'main' 
                      ? 'bg-sage/20' 
                      : entity.type === 'practitioner' 
                      ? 'bg-eucalyptus/20' 
                      : 'bg-sand/20'
                  }`}>
                    <Calendar className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      entity.type === 'main' 
                        ? 'text-sage' 
                        : entity.type === 'practitioner' 
                        ? 'text-eucalyptus' 
                        : 'text-sand'
                    }`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-card-foreground text-sm sm:text-base">{entity.name}</p>
                      <Badge variant="outline" className="text-xs capitalize">
                        {entity.type}
                      </Badge>
                    </div>
                    {entity.connection?.is_connected ? (
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-emerald-600 flex-wrap">
                        <CheckCircle className="w-3 h-3 shrink-0" />
                        <span>Connected</span>
                        {(entity.connection.google_calendar_name || entity.connection.google_calendar_id) && (
                          <span className="text-muted-foreground truncate max-w-[150px] sm:max-w-[200px]">
                            · {entity.connection.google_calendar_name || entity.connection.google_calendar_id}
                          </span>
                        )}
                        {isTokenExpired(entity.connection) && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); refreshExpiredToken(entity); }}
                            className="text-amber-600 flex items-center gap-1 hover:text-amber-700 hover:underline"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span className="text-xs">Refresh token</span>
                          </button>
                        )}
                      </div>
                    ) : entity.connection && !entity.connection.is_connected ? (
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        Disconnected
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                        <XCircle className="w-3 h-3" />
                        Not connected
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  {entity.connection?.is_connected ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs sm:text-sm"
                        onClick={() => changeCalendar(entity)}
                        disabled={changingCalendar === entity.id}
                      >
                        {changingCalendar === entity.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Change'
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs sm:text-sm"
                        onClick={() => disconnectCalendar(entity)}
                      >
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs sm:text-sm"
                      onClick={() => connectCalendar(entity)}
                      disabled={connecting === entity.id}
                    >
                      {connecting === entity.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        'Connect'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">How Calendar Sync Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-card-foreground">Practitioner Calendars:</strong> Each practitioner can connect their personal Google Calendar. The system will read their availability (busy times) and write new bookings as events.
          </p>
          <p>
            <strong className="text-card-foreground">Room Calendars:</strong> Connect a calendar for each treatment room to prevent double-booking and see room availability at a glance.
          </p>
          <p>
            <strong className="text-card-foreground">Main Booking Calendar:</strong> A central calendar that receives all bookings, giving you an overview of the entire schedule.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
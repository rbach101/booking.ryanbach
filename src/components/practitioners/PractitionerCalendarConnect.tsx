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

interface PractitionerCalendarConnectProps {
  practitionerId: string;
  practitionerName: string;
}

// Published URL for Google OAuth redirect - must match Google Cloud Console
const PUBLISHED_URL = import.meta.env.VITE_APP_URL || 'https://booking.ryanbach.tech';

export function PractitionerCalendarConnect({ practitionerId, practitionerName }: PractitionerCalendarConnectProps) {
  const { user } = useAuth();
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [changingCalendar, setChangingCalendar] = useState(false);

  // Calendar selection state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [savingConnection, setSavingConnection] = useState(false);
  const [isChangingExisting, setIsChangingExisting] = useState(false);

  const fetchConnection = async () => {
    try {
      const { data, error } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('owner_type', 'practitioner')
        .eq('owner_id', practitionerId)
        .maybeSingle();

      if (error) throw error;
      setConnection(data);
    } catch (error) {
      console.error('Error fetching calendar connection:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnection();

    // Handle OAuth callback - Google returns 'code' and 'state' params
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');

    if (error) {
      toast.error(`Calendar connection failed: ${error}`);
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (code && state) {
      try {
        const stateData = JSON.parse(state);
        // Only handle if this is for our practitioner
        if (stateData.ownerType === 'practitioner' && stateData.ownerId === practitionerId) {
          handleOAuthCallback(code, state);
        }
      } catch (e) {
        console.error('Failed to parse state:', e);
      }
    }
  }, [practitionerId]);

  const handleOAuthCallback = async (code: string, stateStr: string) => {
    try {
      const stateData = JSON.parse(stateStr);
      // Use my-settings page as redirect (staff-accessible)
      const redirectUri = `${PUBLISHED_URL}/my-settings`;

      const { data: { session } } = await supabase.auth.getSession();

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

      // Fetch available calendars
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

      setPendingConnection({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        ownerType: 'practitioner',
        ownerId: practitionerId,
        entityName: practitionerName,
      });
      setAvailableCalendars(calendarData.calendars || []);

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
        await supabase
          .from('calendar_connections')
          .update({
            google_calendar_id: selectedCalendarId,
            google_calendar_name: selectedCal?.summary || null,
          })
          .eq('owner_type', 'practitioner')
          .eq('owner_id', practitionerId);
      } else {
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
            ownerType: 'practitioner',
            ownerId: practitionerId,
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
              ownerType: 'practitioner',
              ownerId: practitionerId,
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
      fetchConnection();
    } catch (error) {
      console.error('Save connection error:', error);
      toast.error('Failed to save calendar connection');
    } finally {
      setSavingConnection(false);
    }
  };

  const connectCalendar = async () => {
    if (!user) return;

    setConnecting(true);
    try {
      // Use my-settings page as redirect (staff-accessible)
      const redirectUri = `${PUBLISHED_URL}/my-settings`;

      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'get-auth-url',
          redirectUri,
          ownerType: 'practitioner',
          ownerId: practitionerId,
          userId: user.id,
        },
      });

      if (error) throw error;

      safeRedirect(data.authUrl);
    } catch (error) {
      console.error('Connect error:', error);
      toast.error('Failed to initiate calendar connection');
      setConnecting(false);
    }
  };

  const disconnectCalendar = async () => {
    if (!connection) return;

    try {
      const { error } = await supabase
        .from('calendar_connections')
        .update({ is_connected: false })
        .eq('id', connection.id);

      if (error) throw error;

      toast.success('Calendar disconnected');
      fetchConnection();
    } catch (error) {
      console.error('Disconnect error:', error);
      toast.error('Failed to disconnect calendar');
    }
  };

  const changeCalendar = async () => {
    if (!connection) return;

    setChangingCalendar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: refreshData, error: refreshError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'refresh-token',
          connectionId: connection.id,
        },
      });

      if (refreshData?.code === 'TOKEN_EXPIRED' || refreshError) {
        toast.info('Token expired. Reconnecting to Google Calendar...');
        setChangingCalendar(false);
        connectCalendar();
        return;
      }

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

      setPendingConnection({
        accessToken: refreshData.access_token,
        refreshToken: '',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        ownerType: 'practitioner',
        ownerId: practitionerId,
        entityName: practitionerName,
      });
      setAvailableCalendars(calendarData.calendars || []);

      const currentCalId = connection.google_calendar_id;
      const currentInList = calendarData.calendars?.find((c: GoogleCalendar) => c.id === currentCalId);
      setSelectedCalendarId(currentInList?.id || calendarData.calendars?.[0]?.id || '');

      setIsChangingExisting(true);
      setShowCalendarPicker(true);
    } catch (error: any) {
      console.error('Change calendar error:', error);
      if (error?.message?.includes('expired') || error?.message?.includes('TOKEN_EXPIRED')) {
        toast.info('Token expired. Reconnecting to Google Calendar...');
        connectCalendar();
      } else {
        toast.error('Failed to load calendars. You may need to reconnect.');
      }
    } finally {
      setChangingCalendar(false);
    }
  };

  const refreshExpiredToken = async () => {
    if (!connection) {
      connectCalendar();
      return;
    }

    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data: refreshData, error: refreshError } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'refresh-token',
          connectionId: connection.id,
        },
      });

      if (refreshError || refreshData?.error) {
        toast.info('Refresh token expired. Redirecting to Google login...');
        connectCalendar();
        return;
      }

      toast.success('Token refreshed successfully');
      fetchConnection();
    } catch (error) {
      console.error('Refresh error:', error);
      toast.info('Could not refresh token. Redirecting to Google login...');
      connectCalendar();
    } finally {
      setConnecting(false);
    }
  };

  const isTokenExpired = () => {
    if (!connection?.google_token_expiry) return false;
    const expiry = new Date(connection.google_token_expiry);
    return expiry < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <>
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
              Choose which calendar to use for {practitionerName}
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
                    <div 
                      key={cal.id} 
                      className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer" 
                      onClick={() => setSelectedCalendarId(cal.id)}
                    >
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

      {/* Calendar Connection Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sage" />
            Google Calendar Sync
          </CardTitle>
          <CardDescription className="text-sm">
            Connect your personal Google Calendar to sync busy times and appointments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              {connection?.is_connected ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-sm text-emerald-600">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                    {connection.google_calendar_name && (
                      <span className="text-muted-foreground ml-1">
                        · {connection.google_calendar_name}
                      </span>
                    )}
                  </div>
                  {isTokenExpired() && (
                    <button
                      onClick={refreshExpiredToken}
                      className="text-amber-600 text-sm flex items-center gap-1 hover:text-amber-700 hover:underline"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Token expired - Click to refresh
                    </button>
                  )}
                </div>
              ) : connection && !connection.is_connected ? (
                <div className="flex items-center gap-1 text-sm text-amber-600">
                  <AlertTriangle className="w-3 h-3" />
                  Disconnected - Reconnect required
                </div>
              ) : (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <XCircle className="w-3 h-3" />
                  Not connected
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {connection?.is_connected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={changeCalendar}
                    disabled={changingCalendar}
                  >
                    {changingCalendar ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Change'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnectCalendar}
                  >
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={connectCalendar}
                  disabled={connecting}
                >
                  {connecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Connect Calendar'
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

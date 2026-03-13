import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { safeRedirect } from '@/lib/safeRedirect';

interface BusyTime {
  start: string;
  end: string;
}

interface CalendarBusyTimes {
  [key: string]: BusyTime[];
}

interface ExpiredConnection {
  connectionId: string;
  ownerType: string;
  ownerId: string | null;
}

export function useCalendarBusyTimes(currentDate: Date, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const [busyTimes, setBusyTimes] = useState<CalendarBusyTimes>({});
  const [loading, setLoading] = useState(false);
  const [expiredConnections, setExpiredConnections] = useState<ExpiredConnection[]>([]);
  const fetchedRef = useRef<string | null>(null);

  // Stabilize the date to a week-start string so object identity changes don't trigger re-renders
  const cacheKey = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return format(weekStart, 'yyyy-MM-dd');
  }, [currentDate.getTime()]);

  const triggerReconnect = useCallback(async (ownerType: string, ownerId: string | null) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please log in to reconnect calendar');
        return;
      }

      const redirectUri = `${window.location.origin}/settings`;
      
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        headers: session?.access_token ? {
          Authorization: `Bearer ${session.access_token}`
        } : undefined,
        body: {
          action: 'get-auth-url',
          redirectUri,
          ownerType,
          ownerId,
          userId: user.id,
        },
      });

      if (error) throw error;

      toast.info('Reconnecting to Google Calendar...');
      safeRedirect(data.authUrl);
    } catch (error) {
      console.error('Failed to trigger reconnect:', error);
      toast.error('Failed to reconnect calendar. Please try from Settings.');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let isMounted = true;
    
    if (fetchedRef.current === cacheKey) return;
    
    const fetchBusyTimes = async () => {
      setLoading(true);
      setExpiredConnections([]);
      
      try {
        // Check how many active connections exist
        const { count: activeConnectionCount } = await supabase
          .from('calendar_connections')
          .select('id', { count: 'exact', head: true })
          .eq('is_connected', true)
          .in('owner_type', ['practitioner', 'room']);

        // Try to load from cache (instant) — only for active connections
        const { data: cachedData, error: cacheError } = await supabase
          .from('calendar_busy_cache')
          .select('owner_type, owner_id, busy_times, connection_id, updated_at, calendar_connections!inner(is_connected)')
          .eq('week_start', cacheKey)
          .eq('calendar_connections.is_connected', true);

        // Only use cache if ALL active connections have cache entries AND cache is fresh
        const uniqueCachedConnections = new Set(cachedData?.map(d => d.connection_id) || []);
        const cacheIsComplete = !cacheError && cachedData && cachedData.length > 0 
          && uniqueCachedConnections.size >= (activeConnectionCount || 0);
        
        // Check freshness (within 15 minutes)
        const now = new Date();
        const maxAge = 15 * 60 * 1000;
        const cacheIsFresh = cacheIsComplete && cachedData!.some((entry: any) => {
          const updatedAt = new Date(entry.updated_at);
          return now.getTime() - updatedAt.getTime() < maxAge;
        });

        if (cacheIsComplete && cacheIsFresh) {
          // Build busy times map from cache
          const cachedBusyTimes: CalendarBusyTimes = {};
          for (const row of cachedData!) {
            const key = row.owner_type === 'main'
              ? 'main'
              : row.owner_type === 'room'
                ? `room_${row.owner_id}`
                : row.owner_id;
            if (key) {
              const existing = cachedBusyTimes[key] || [];
              cachedBusyTimes[key] = [...existing, ...((row.busy_times as unknown as BusyTime[]) || [])];
            }
          }
          
          if (isMounted) {
            setBusyTimes(cachedBusyTimes);
            fetchedRef.current = cacheKey;
            setLoading(false);
          }
          return;
        }

        // Cache incomplete or stale — fall back to live fetch via edge function
        const { data: { user } } = await supabase.auth.getUser();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (isMounted) setLoading(false);
          return;
        }
        const headers = { Authorization: `Bearer ${session.access_token}` };

        const startDate = cacheKey;
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const endDate = format(weekEnd, 'yyyy-MM-dd');

        const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
          headers,
          body: {
            action: 'get-all-busy-times',
            startDate,
            endDate,
          },
        });

        if (error) {
          console.error('Error fetching busy times:', error);
          if (isMounted) fetchedRef.current = cacheKey;
          return;
        }

        if (isMounted) {
          setBusyTimes(data?.busyTimes || {});
          fetchedRef.current = cacheKey;
          
          const expired: ExpiredConnection[] = data?.expired || [];
          if (expired.length > 0) {
            setExpiredConnections(expired);
            const first = expired[0];
            toast.info('Calendar token expired. Reconnecting automatically...', { duration: 3000 });
            setTimeout(() => {
              if (isMounted) {
                triggerReconnect(first.ownerType, first.ownerId);
              }
            }, 1500);
          }
        }
      } catch (err) {
        console.error('Error fetching calendar busy times:', err);
        if (isMounted) fetchedRef.current = cacheKey;
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchBusyTimes();
    
    return () => {
      isMounted = false;
    };
  }, [enabled, cacheKey, triggerReconnect]);

  // Listen for cache updates via realtime
  useEffect(() => {
    const channel = supabase
      .channel('busy-cache-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_busy_cache',
          filter: `week_start=eq.${cacheKey}`,
        },
        () => {
          // Reset fetched ref so it re-reads from cache
          fetchedRef.current = null;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cacheKey]);

  return { busyTimes, loading, expiredConnections };
}

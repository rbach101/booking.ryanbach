import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const WARNING_MS = 13 * 60 * 1000; // Warn at 13 minutes (2 min before logout)
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const handleTimeout = useCallback(async () => {
    clearTimers();
    toast.error('Session expired due to inactivity. Please log in again.');
    await signOut();
  }, [signOut, clearTimers]);

  const resetTimers = useCallback(() => {
    clearTimers();
    if (!user) return;

    warningRef.current = setTimeout(() => {
      toast.warning('Your session will expire in 2 minutes due to inactivity.', {
        duration: 10000,
      });
    }, WARNING_MS);

    timeoutRef.current = setTimeout(handleTimeout, TIMEOUT_MS);
  }, [user, handleTimeout, clearTimers]);

  useEffect(() => {
    if (!user) {
      clearTimers();
      return;
    }

    resetTimers();

    const handler = () => resetTimers();
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, handler, { passive: true }));

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, handler));
    };
  }, [user, resetTimers, clearTimers]);
}

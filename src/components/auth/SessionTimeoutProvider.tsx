import { useSessionTimeout } from '@/hooks/useSessionTimeout';

export function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  useSessionTimeout();
  return <>{children}</>;
}

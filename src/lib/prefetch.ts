/**
 * Prefetch route chunks on hover to reduce perceived load time.
 * Uses the same import paths as App.tsx lazy routes for chunk reuse.
 */
const prefetchMap: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('@/pages/Index'),
  '/calendar': () => import('@/pages/CalendarPage'),
  '/bookings': () => import('@/pages/BookingsPage'),
  '/customers': () => import('@/pages/CustomersPage'),
  '/practitioners': () => import('@/pages/PractitionersPage'),
  '/services': () => import('@/pages/ServicesPage'),
  '/rooms': () => import('@/pages/RoomsPage'),
  '/messages': () => import('@/pages/MessagesPage'),
  '/memberships': () => import('@/pages/MembershipsPage'),
  '/settings': () => import('@/pages/SettingsPage'),
};

export function prefetchRoute(path: string): void {
  const fn = prefetchMap[path];
  if (fn) fn();
}

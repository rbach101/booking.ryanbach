import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useDashboardAlerts() {
  const { user, isAdmin } = useAuth();

  const { data: counts = { pending: 0, balances: 0 } } = useQuery({
    queryKey: ['dashboard-alerts', user?.id, isAdmin],
    queryFn: async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const sixtyDaysAhead = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [pendingRes, balanceRes, practRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, practitioner_id')
          .gte('booking_date', thirtyDaysAgo)
          .lte('booking_date', sixtyDaysAhead)
          .or('status.eq.pending,status.eq.pending_approval'),
        supabase
          .from('bookings')
          .select('id, practitioner_id, is_insurance_booking')
          .gte('booking_date', thirtyDaysAgo)
          .or('status.eq.confirmed,status.eq.checked-in')
          .gt('balance_due', 0),
        user?.id
          ? supabase.from('practitioners').select('id').eq('user_id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      let pendingList = pendingRes.data || [];
      let balanceList = (balanceRes.data || []).filter((b: { is_insurance_booking: boolean }) => !b.is_insurance_booking);
      if (!isAdmin && practRes.data?.id) {
        const practId = practRes.data.id;
        pendingList = pendingList.filter((b: { practitioner_id: string }) => b.practitioner_id === practId);
        balanceList = balanceList.filter((b: { practitioner_id: string }) => b.practitioner_id === practId);
      }
      const pending = pendingList.length;
      const balances = balanceList.length;

      return { pending, balances };
    },
    enabled: !!user,
    staleTime: 1000 * 60,
  });

  return counts.pending + counts.balances;
}

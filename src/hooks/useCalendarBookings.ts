import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Booking } from '@/types/booking';
import { useEffect } from 'react';

export function useCalendarBookings() {
  const queryClient = useQueryClient();

  // Set up realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('bookings-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['calendar-bookings'],
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .in('status', ['confirmed', 'pending', 'pending_approval', 'checked-in']);

      if (error) throw error;

      return (data || []).map(b => ({
        id: b.id,
        clientName: b.client_name,
        clientEmail: b.client_email,
        clientPhone: b.client_phone || '',
        serviceType: b.service_id || '',
        practitionerId: b.practitioner_id || '',
        practitioner2Id: b.practitioner_2_id || null,
        roomId: b.room_id || '',
        date: b.booking_date,
        startTime: b.start_time,
        endTime: b.end_time,
        status: b.status as Booking['status'],
        notes: b.notes || '',
        createdAt: b.created_at,
      }));
    },
  });
}

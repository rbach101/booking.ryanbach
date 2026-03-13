import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Room, Service } from '@/types/booking';

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: async (): Promise<Room[]> => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      return (data || []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        capacity: r.capacity || 1,
        amenities: r.amenities || [],
        color: r.color || 'hsl(200, 60%, 55%)',
      }));
    },
  });
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      return (data || []).map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        duration: s.duration,
        price: Number(s.price),
        category: s.category || '',
        practitionerIds: s.practitioner_ids || [],
        is_couples: s.is_couples ?? false,
      }));
    },
  });
}

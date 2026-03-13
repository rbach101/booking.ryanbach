import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Practitioner, WeeklyAvailability } from '@/types/booking';

interface AvailabilityBlock {
  id: string;
  practitioner_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

const dayNumberToName: Record<number, keyof WeeklyAvailability> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function transformAvailability(blocks: AvailabilityBlock[]): WeeklyAvailability {
  const availability: WeeklyAvailability = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  blocks.forEach(block => {
    if (block.is_available) {
      const dayName = dayNumberToName[block.day_of_week];
      if (dayName) {
        availability[dayName].push({
          start: block.start_time.slice(0, 5), // HH:mm format
          end: block.end_time.slice(0, 5),
        });
      }
    }
  });

  return availability;
}

export function usePractitioners(options?: { publicOnly?: boolean }) {
  const publicOnly = options?.publicOnly ?? false;

  return useQuery({
    queryKey: ['practitioners', { publicOnly }],
    queryFn: async () => {
      if (publicOnly) {
        // Use the public view that excludes email/phone
        const { data: practitioners, error: practitionersError } = await supabase
          .from('practitioners_public')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (practitionersError) throw practitionersError;

        // Fetch availability blocks for public practitioners
        const { data: availabilityBlocks, error: availabilityError } = await supabase
          .from('availability_blocks')
          .select('*')
          .in('practitioner_id', (practitioners || []).map(p => p.id!));

        if (availabilityError) throw availabilityError;

        // Filter out practitioners with no available schedule blocks
        const practitionersWithSchedule = (practitioners || []).filter(p => {
          const blocks = availabilityBlocks?.filter(
            b => b.practitioner_id === p.id && b.is_available
          ) || [];
          return blocks.length > 0;
        });

        return practitionersWithSchedule.map((p): Practitioner & { user_id?: string } => {
          const practitionerBlocks = availabilityBlocks?.filter(
            b => b.practitioner_id === p.id
          ) || [];

          return {
            id: p.id!,
            name: p.name!,
            email: '',
            phone: '',
            specialties: p.specialties || [],
            color: p.color || 'hsl(150, 35%, 45%)',
            avatar: p.image_url || undefined,
            bio: p.bio || undefined,
            image: p.image_url || undefined,
            availability: transformAvailability(practitionerBlocks as AvailabilityBlock[]),
            user_id: p.user_id || undefined,
          };
        });
      }

      // Staff/admin path: fetch from base table with full details
      const { data: practitioners, error: practitionersError } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (practitionersError) throw practitionersError;

      // Fetch all availability blocks
      const { data: availabilityBlocks, error: availabilityError } = await supabase
        .from('availability_blocks')
        .select('*')
        .in('practitioner_id', practitioners.map(p => p.id));

      if (availabilityError) throw availabilityError;

      // Transform to Practitioner type
      return practitioners.map((p): Practitioner & { user_id?: string } => {
        const practitionerBlocks = availabilityBlocks?.filter(
          b => b.practitioner_id === p.id
        ) || [];

        return {
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone || '',
          specialties: p.specialties || [],
          color: p.color || 'hsl(150, 35%, 45%)',
          avatar: p.image_url || undefined,
          bio: p.bio || undefined,
          image: p.image_url || undefined,
          availability: transformAvailability(practitionerBlocks as AvailabilityBlock[]),
          user_id: p.user_id || undefined,
        };
      });
    },
  });
}

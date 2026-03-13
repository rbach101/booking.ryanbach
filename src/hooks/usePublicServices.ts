import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceGroup, FullService, DurationOption } from '@/data/fullServiceData';
import { debugLog } from '@/lib/debugLog';

const DEFAULT_IMAGE = 'https://placehold.co/640x400/6b8f71/ffffff?text=Service';

/** Extract base name for grouping: "60 Min Massage" -> "Massage", "Massage With Insurance" -> "Massage With Insurance" */
function getGroupKey(name: string, duration: number): string {
  const match = name.match(/^\d+\s*Min\s+(.+)$/i);
  return match ? match[1].trim() : name;
}

/** Convert DB services to ServiceGroups (grouped by base name) and FullServices */
function dbServicesToGroupsAndFull(rows: {
  id: string;
  name: string;
  duration: number;
  price: number;
  deposit_required: number | null;
  description: string | null;
  category: string | null;
  practitioner_ids: string[] | null;
  is_outcall: boolean | null;
  is_couples: boolean | null;
  is_local: boolean | null;
  image_url: string | null;
}[]): { serviceGroups: ServiceGroup[]; fullServices: FullService[] } {
  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = getGroupKey(row.name, row.duration);
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key)!.push(row);
  }

  const serviceGroups: ServiceGroup[] = [];
  const fullServices: FullService[] = [];

  for (const [baseName, groupRows] of byGroup) {
    const first = groupRows[0]!;
    const durations: DurationOption[] = groupRows
      .sort((a, b) => a.duration - b.duration)
      .map((r) => ({
        id: r.id,
        duration: r.duration,
        price: Number(r.price),
        depositRequired: Number(r.deposit_required ?? r.price / 2),
        description: r.description ?? undefined,
      }));

    const practitionerIds = first.practitioner_ids || [];
    const image = first.image_url || DEFAULT_IMAGE;
    const category = (first.category || 'massage').toLowerCase();

    const group: ServiceGroup = {
      id: first.id,
      name: baseName,
      baseDescription: first.description || '',
      category,
      image,
      practitionerIds,
      isOutcall: first.is_outcall ?? false,
      isCouples: first.is_couples ?? false,
      isLocal: first.is_local ?? false,
      durations,
    };
    serviceGroups.push(group);

    for (const row of groupRows) {
      const displayName =
        groupRows.length > 1 ? `${row.duration} Min ${baseName}` : baseName;
      fullServices.push({
        id: row.id,
        name: displayName,
        duration: row.duration,
        price: Number(row.price),
        depositRequired: Number(row.deposit_required ?? row.price / 2),
        description: row.description || group.baseDescription,
        category,
        image,
        practitionerIds,
        isOutcall: row.is_outcall ?? false,
        isCouples: row.is_couples ?? false,
        isLocal: row.is_local ?? false,
      });
    }
  }

  return { serviceGroups, fullServices };
}

export function usePublicServices() {
  return useQuery({
    queryKey: ['public-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (error) throw error;
      const rows = data || [];
      const result = dbServicesToGroupsAndFull(rows);
      // #region agent log
      debugLog('usePublicServices.ts:queryFn', 'Public services loaded from DB', {
        rowCount: rows.length,
        groupCount: result.serviceGroups.length,
        fullServiceCount: result.fullServices.length,
        groupNames: result.serviceGroups.map((g) => g.name),
      });
      // #endregion
      return result;
    },
    staleTime: 60_000,
  });
}

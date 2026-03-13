import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PractitionerCalendarConnect } from './PractitionerCalendarConnect';
import { useQueryClient } from '@tanstack/react-query';

interface TimeSlot {
  id?: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

interface DaySchedule {
  day: number;
  dayName: string;
  slots: TimeSlot[];
}

interface ScheduleEditorProps {
  practitionerId: string;
  practitionerName: string;
  onClose?: () => void;
}

const DAYS_OF_WEEK = [
  { day: 0, name: 'Sunday' },
  { day: 1, name: 'Monday' },
  { day: 2, name: 'Tuesday' },
  { day: 3, name: 'Wednesday' },
  { day: 4, name: 'Thursday' },
  { day: 5, name: 'Friday' },
  { day: 6, name: 'Saturday' },
];

export function ScheduleEditor({ practitionerId, practitionerName, onClose }: ScheduleEditorProps) {
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchSchedule();
  }, [practitionerId]);

  const fetchSchedule = async () => {
    try {
      const { data, error } = await supabase
        .from('availability_blocks')
        .select('*')
        .eq('practitioner_id', practitionerId)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;

      // Initialize schedule for all days
      const initialSchedule: DaySchedule[] = DAYS_OF_WEEK.map(({ day, name }) => ({
        day,
        dayName: name,
        slots: [],
      }));

      // Populate with existing data
      data?.forEach((block) => {
        const dayIndex = initialSchedule.findIndex(d => d.day === block.day_of_week);
        if (dayIndex !== -1) {
          initialSchedule[dayIndex].slots.push({
            id: block.id,
            start_time: block.start_time,
            end_time: block.end_time,
            is_available: block.is_available ?? true,
          });
        }
      });

      setSchedule(initialSchedule);
    } catch (error) {
      console.error('Error fetching schedule:', error);
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  };

  const addSlot = (dayIndex: number) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].slots.push({
        start_time: '09:00',
        end_time: '17:00',
        is_available: true,
      });
      return updated;
    });
  };

  const removeSlot = (dayIndex: number, slotIndex: number) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].slots.splice(slotIndex, 1);
      return updated;
    });
  };

  const updateSlot = (dayIndex: number, slotIndex: number, field: keyof TimeSlot, value: string | boolean) => {
    setSchedule(prev => {
      const updated = [...prev];
      updated[dayIndex].slots[slotIndex] = {
        ...updated[dayIndex].slots[slotIndex],
        [field]: value,
      };
      return updated;
    });
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      // Delete existing availability for this practitioner
      const { error: deleteError } = await supabase
        .from('availability_blocks')
        .delete()
        .eq('practitioner_id', practitionerId);

      if (deleteError) throw deleteError;

      // Insert new availability blocks
      const blocksToInsert = schedule.flatMap(day =>
        day.slots.map(slot => ({
          practitioner_id: practitionerId,
          day_of_week: day.day,
          start_time: slot.start_time,
          end_time: slot.end_time,
          is_available: slot.is_available,
        }))
      );

      if (blocksToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('availability_blocks')
          .insert(blocksToInsert);

        if (insertError) throw insertError;
      }

      toast.success('Schedule saved successfully');
      // Ensure all views that depend on practitioner availability refresh automatically
      queryClient.invalidateQueries({ queryKey: ['practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['practitioners', { publicOnly: true }] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-practitioners'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
      onClose?.();
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const copyToAllDays = (sourceDay: number) => {
    const sourceSlots = schedule.find(d => d.day === sourceDay)?.slots;
    if (!sourceSlots || sourceSlots.length === 0) {
      toast.error('No slots to copy');
      return;
    }

    setSchedule(prev =>
      prev.map(day => ({
        ...day,
        slots: sourceSlots.map(slot => ({ ...slot, id: undefined })),
      }))
    );
    toast.success('Copied to all days');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="border-b border-border pb-4">
        <h3 className="font-display text-xl font-semibold text-foreground">
          Schedule for {practitionerName}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Set available hours and connect your Google Calendar
        </p>
      </div>

      {/* Google Calendar Connection */}
      <PractitionerCalendarConnect 
        practitionerId={practitionerId} 
        practitionerName={practitionerName} 
      />

      <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 mt-4">
        {schedule.map((day, dayIndex) => (
          <div
            key={day.day}
            className={cn(
              "rounded-lg border border-border/50 p-4 transition-colors",
              day.slots.length > 0 ? "bg-sage-light/30" : "bg-muted/30"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-foreground">{day.dayName}</h4>
              <div className="flex items-center gap-2">
                {day.slots.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToAllDays(day.day)}
                    className="text-xs"
                  >
                    Copy to all
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addSlot(dayIndex)}
                  className="gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add slot
                </Button>
              </div>
            </div>

            {day.slots.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No availability set — this day is off
              </p>
            ) : (
              <div className="space-y-3">
                {day.slots.map((slot, slotIndex) => (
                  <div
                    key={slotIndex}
                    className="flex items-center gap-3 bg-background rounded-md p-3 border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={slot.is_available}
                        onCheckedChange={(checked) =>
                          updateSlot(dayIndex, slotIndex, 'is_available', checked)
                        }
                      />
                      <Label className="text-sm text-muted-foreground">
                        {slot.is_available ? 'Available' : 'Blocked'}
                      </Label>
                    </div>

                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={slot.start_time}
                        onChange={(e) =>
                          updateSlot(dayIndex, slotIndex, 'start_time', e.target.value)
                        }
                        className="w-auto"
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={slot.end_time}
                        onChange={(e) =>
                          updateSlot(dayIndex, slotIndex, 'end_time', e.target.value)
                        }
                        className="w-auto"
                      />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSlot(dayIndex, slotIndex)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-border flex-shrink-0">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button variant="sage" onClick={saveSchedule} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Schedule'
          )}
        </Button>
      </div>
    </div>
  );
}

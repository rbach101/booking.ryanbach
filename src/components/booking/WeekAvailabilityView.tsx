import { useMemo } from 'react';
import { format, addDays, isSameDay, startOfDay } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeSlot {
  time: string;
  available: boolean;
}

interface DayAvailability {
  date: Date;
  dayName: string;
  dateLabel: string;
  slots: TimeSlot[];
  isToday: boolean;
}

interface WeekAvailabilityViewProps {
  startDate: Date;
  selectedDate: Date | undefined;
  selectedTime: string;
  onSelectDateTime: (date: Date, time: string) => void;
  onNavigateWeek: (direction: 'prev' | 'next') => void;
  getAvailableSlotsForDate: (date: Date) => string[];
  isDateAvailable: (date: Date) => boolean;
  loadingAvailability: boolean;
  formatTime: (time: string) => string;
}

export function WeekAvailabilityView({
  startDate,
  selectedDate,
  selectedTime,
  onSelectDateTime,
  onNavigateWeek,
  getAvailableSlotsForDate,
  isDateAvailable,
  loadingAvailability,
  formatTime,
}: WeekAvailabilityViewProps) {
  const today = startOfDay(new Date());

  // Generate 7 days starting from startDate
  const weekDays = useMemo(() => {
    const days: DayAvailability[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(startDate, i);
      const isPast = date < today;
      const dateAvailable = !isPast && isDateAvailable(date);
      const slots = dateAvailable ? getAvailableSlotsForDate(date) : [];
      
      days.push({
        date,
        dayName: format(date, 'EEE'),
        dateLabel: format(date, 'MMM d'),
        slots: slots.map(time => ({ time, available: true })),
        isToday: isSameDay(date, today),
      });
    }
    return days;
  }, [startDate, today, isDateAvailable, getAvailableSlotsForDate]);

  const canGoPrev = startDate > today;

  // Get the maximum number of slots across all days to ensure consistent height
  const maxSlots = useMemo(() => {
    return Math.max(...weekDays.map(d => d.slots.length), 0);
  }, [weekDays]);

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigateWeek('prev')}
          disabled={!canGoPrev}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {format(startDate, 'MMM d')} - {format(addDays(startDate, 6), 'MMM d, yyyy')}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigateWeek('next')}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loadingAvailability && (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading availability...</span>
        </div>
      )}

      {!loadingAvailability && (
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-4 min-w-max">
            {weekDays.map((day) => {
              const isSelected = selectedDate && isSameDay(day.date, selectedDate);
              const hasSlots = day.slots.length > 0;
              const isPast = day.date < today;

              return (
                <div
                  key={day.date.toISOString()}
                  className={cn(
                    "flex flex-col rounded-lg border p-3 transition-colors min-w-[100px] w-[100px]",
                    isSelected && "border-primary bg-primary/5",
                    !hasSlots && !isPast && "opacity-60",
                    isPast && "opacity-40"
                  )}
                >
                  {/* Day Header */}
                  <div className="text-center mb-3 pb-2 border-b">
                    <div className={cn(
                      "font-semibold text-sm",
                      day.isToday && "text-primary"
                    )}>
                      {day.dayName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {day.dateLabel}
                    </div>
                    {day.isToday && (
                      <Badge variant="secondary" className="text-xs mt-1">Today</Badge>
                    )}
                  </div>

                  {/* Time Slots - Vertical Stack */}
                  <div className="flex flex-col gap-2 flex-1">
                    {hasSlots ? (
                      day.slots.map((slot) => {
                        const isSlotSelected = isSelected && selectedTime === slot.time;
                        return (
                          <Button
                            key={`${day.date.toISOString()}-${slot.time}`}
                            type="button"
                            size="sm"
                            variant={isSlotSelected ? "default" : "outline"}
                            onClick={() => onSelectDateTime(day.date, slot.time)}
                            className={cn(
                              "w-full text-xs",
                              isSlotSelected && "bg-sage hover:bg-sage-dark"
                            )}
                          >
                            {formatTime(slot.time)}
                          </Button>
                        );
                      })
                    ) : (
                      <div className="text-xs text-muted-foreground text-center py-4">
                        {isPast ? "Past" : "No slots"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Selection Summary */}
      {selectedDate && selectedTime && (
        <div className="bg-sage/10 rounded-lg p-3 border border-sage/20">
          <p className="text-sm font-medium text-sage-dark">
            Selected: {format(selectedDate, 'EEEE, MMMM d, yyyy')} at {formatTime(selectedTime)}
          </p>
        </div>
      )}
    </div>
  );
}

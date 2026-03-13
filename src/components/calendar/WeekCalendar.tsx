import { useState, useMemo, useCallback } from 'react';

import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Booking, Practitioner, Room } from '@/types/booking';
import { cn } from '@/lib/utils';
import { useCalendarBusyTimes } from '@/hooks/useCalendarBusyTimes';

interface WeekCalendarProps {
  bookings: Booking[];
  practitioners: Practitioner[];
  rooms: Room[];
  onBookingClick?: (booking: Booking) => void;
  viewType: 'practitioners' | 'rooms';
}

const timeSlots = Array.from({ length: 25 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const minutes = (i % 2) * 30;
  return {
    hour,
    minutes,
    label: minutes === 0 
      ? `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'pm' : 'am'}`
      : `${hour > 12 ? hour - 12 : hour}:30`,
    time: `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`,
    decimalHour: hour + minutes / 60,
  };
});

export function WeekCalendar({ 
  bookings, 
  practitioners, 
  rooms, 
  onBookingClick,
  viewType 
}: WeekCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.getTime()]);
  const { busyTimes, loading: busyLoading } = useCalendarBusyTimes(currentDate);

  const items = viewType === 'practitioners' ? practitioners : rooms;
  const isRoomView = viewType === 'rooms';

  // Pre-index bookings by date for O(1) lookup instead of scanning all bookings per cell
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const existing = map.get(b.date);
      if (existing) existing.push(b);
      else map.set(b.date, [b]);
    }
    return map;
  }, [bookings]);

  // Pre-index busy times by key+date for fast lookup
  // Expands multi-day/all-day events across each date they cover
  const busyByKeyDate = useMemo(() => {
    const map = new Map<string, { start: Date; end: Date; summary?: string }[]>();
    const HAWAII_TZ = 'Pacific/Honolulu';
    
    for (const [key, times] of Object.entries(busyTimes)) {
      for (const busy of times) {
        const isAllDay = !busy.start.includes('T');
        
        if (isAllDay) {
          // All-day events: date-only strings, end is exclusive
          const startParts = busy.start.split('-').map(Number);
          const endParts = busy.end.split('-').map(Number);
          const eventStart = new Date(startParts[0], startParts[1] - 1, startParts[2]);
          const eventEnd = new Date(endParts[0], endParts[1] - 1, endParts[2]); // exclusive
          
          const cursor = new Date(eventStart);
          while (cursor < eventEnd) {
            const dateStr = format(cursor, 'yyyy-MM-dd');
            const mapKey = `${key}:${dateStr}`;
            // Create synthetic full-day block in Hawaii time
            const nextDay = new Date(cursor);
            nextDay.setDate(nextDay.getDate() + 1);
            const entry = {
              start: new Date(`${dateStr}T10:00:00.000Z`), // 00:00 HST
              end: new Date(`${format(nextDay, 'yyyy-MM-dd')}T09:59:00.000Z`), // 23:59 HST
              summary: (busy as any).summary || 'Busy',
            };
            const existing = map.get(mapKey);
            if (existing) existing.push(entry);
            else map.set(mapKey, [entry]);
            cursor.setDate(cursor.getDate() + 1);
          }
        } else {
          // Timed events — bucket by Hawaii date
          const busyStart = parseISO(busy.start);
          const busyEnd = parseISO(busy.end);
          const busyStartHawaii = toZonedTime(busyStart, HAWAII_TZ);
          const busyEndHawaii = toZonedTime(busyEnd, HAWAII_TZ);
          const startDateStr = format(busyStartHawaii, 'yyyy-MM-dd');
          const endDateStr = format(busyEndHawaii, 'yyyy-MM-dd');
          const entry = { start: busyStart, end: busyEnd, summary: (busy as any).summary };
          
          const addToMap = (dateStr: string) => {
            const mapKey = `${key}:${dateStr}`;
            const existing = map.get(mapKey);
            if (existing) existing.push(entry);
            else map.set(mapKey, [entry]);
          };
          
          addToMap(startDateStr);
          if (endDateStr !== startDateStr) {
            addToMap(endDateStr);
          }
        }
      }
    }
    return map;
  }, [busyTimes]);

  // Pre-compute all cell data in one pass
  const cellData = useMemo(() => {
    const data = new Map<string, { booking?: Booking; busyBlock?: { start: Date; end: Date; summary?: string }; hasBooking: boolean; hasBusy: boolean }>();

    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayBookings = bookingsByDate.get(dateStr) || [];

      for (const item of items) {
        const busyKey = isRoomView ? `room_${item.id}` : item.id;
        const allBusy = busyByKeyDate.get(`${busyKey}:${dateStr}`) || [];

        for (const slot of timeSlots) {
          const decHour = slot.decimalHour;
          const cellKey = `${item.id}:${dateStr}:${slot.time}`;

          // Check bookings
                  const matchingBooking = dayBookings.find(b => {
                    const matchesItem = isRoomView 
                      ? b.roomId === item.id 
                      : (b.practitionerId === item.id || b.practitioner2Id === item.id);
                    if (!matchesItem) return false;
            const [sh, sm] = b.startTime.split(':').map(Number);
            const [eh, em] = b.endTime.split(':').map(Number);
            const startDec = sh + sm / 60;
            const endDec = eh + em / 60;
            return decHour >= startDec && decHour < endDec;
          });

          // Show booking chip at the first slot that contains the booking
          // (handles bookings starting at non-slot-aligned times like 9:45)
          const startBooking = matchingBooking ? (() => {
            const [sh, sm] = matchingBooking.startTime.split(':').map(Number);
            const startDec = sh + sm / 60;
            // This is the first slot if the booking start falls within this slot's 30-min window
            const slotEnd = decHour + 0.5;
            return (startDec >= decHour && startDec < slotEnd) ? matchingBooking : undefined;
          })() : undefined;

          // Check busy times
          const matchingBusy = allBusy.find(b => {
            const startDec = b.start.getHours() + b.start.getMinutes() / 60;
            const endDec = (b.end.getHours() || 24) + b.end.getMinutes() / 60;
            return decHour >= startDec && decHour < endDec;
          });

          const startBusy = matchingBusy ? (() => {
            const rawStartDec = matchingBusy.start.getHours() + matchingBusy.start.getMinutes() / 60;
            // Clamp to first visible slot (8am) so all-day events starting at midnight still show a chip
            const clampedStartDec = Math.max(rawStartDec, 8);
            return clampedStartDec === decHour ? matchingBusy : undefined;
          })() : undefined;

          data.set(cellKey, {
            booking: startBooking,
            busyBlock: startBusy,
            hasBooking: !!matchingBooking,
            hasBusy: !!matchingBusy,
          });
        }
      }
    }
    return data;
  }, [weekDays, bookingsByDate, busyByKeyDate, items, isRoomView]);

  const navigateWeek = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => addDays(prev, direction === 'next' ? 7 : -7));
  }, []);

  return (
    <div className="bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold text-card-foreground">
            {format(weekStart, 'MMMM yyyy')}
          </h3>
          <p className="text-sm text-muted-foreground">
            Week of {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateWeek('prev')} aria-label="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigateWeek('next')} aria-label="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
        <div className="min-w-[900px]">
          {/* Day headers */}
          <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border/50 sticky top-0 bg-card z-10">
            <div className="p-2 text-xs font-medium text-muted-foreground border-r border-border/50">
              Time
            </div>
            {weekDays.map(day => (
              <div 
                key={day.toISOString()} 
                className={cn(
                  "p-2 text-center border-r border-border/50 last:border-r-0",
                  isSameDay(day, new Date()) && "bg-sage-light"
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">
                  {format(day, 'EEE')}
                </p>
                <p className={cn(
                  "text-sm font-display font-semibold",
                  isSameDay(day, new Date()) ? "text-sage" : "text-card-foreground"
                )}>
                  {format(day, 'd')}
                </p>
              </div>
            ))}
          </div>

          {/* Time slots */}
          {timeSlots.map((slot) => (
            <div key={slot.time} className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border/30 last:border-b-0">
              <div className={cn(
                "p-1 text-xs text-muted-foreground border-r border-border/50 bg-muted/20 flex items-start justify-end pr-3",
                slot.minutes === 30 && "text-[9px] opacity-60"
              )}>
                {slot.label}
              </div>
              
              {weekDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const cellContent = items.map(item => {
                  const cell = cellData.get(`${item.id}:${dateStr}:${slot.time}`);
                  if (!cell) return null;

                  if (cell.booking) {
                    return (
                      <div
                        key={`booking-${item.id}-${cell.booking.id}`}
                        onClick={() => onBookingClick?.(cell.booking!)}
                        className="px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:opacity-90 transition-opacity truncate mb-0.5"
                        style={{ backgroundColor: item.color, color: 'white' }}
                        title={`${cell.booking.clientName} - ${cell.booking.startTime}-${cell.booking.endTime}`}
                      >
                        <span className="font-medium">
                          {item.name.split(' ')[0]}
                          {cell.booking.practitioner2Id && (() => {
                            const p2 = practitioners.find(p => p.id === cell.booking!.practitioner2Id);
                            return p2 ? ` + ${p2.name.split(' ')[0]}` : '';
                          })()}
                        </span>
                        <span className="ml-1 opacity-90">{cell.booking.clientName}</span>
                      </div>
                    );
                  }
                  
                  if (cell.busyBlock) {
                    const itemColor = item.color || '#ef4444';
                    const summary = cell.busyBlock.summary || 'Blocked';
                    return (
                      <div
                        key={`busy-${item.id}-${slot.time}`}
                        className="px-1.5 py-0.5 rounded text-[10px] truncate mb-0.5"
                        style={{ 
                          backgroundColor: `${itemColor}20`, 
                          color: itemColor,
                          borderWidth: '1px',
                          borderColor: `${itemColor}50`
                        }}
                        title={`${item.name}: ${summary} (${format(cell.busyBlock.start, 'h:mm a')}-${format(cell.busyBlock.end, 'h:mm a')})`}
                      >
                        <span className="font-medium">{item.name.split(' ')[0]}</span>
                        <span className="ml-1 opacity-80">{summary}</span>
                      </div>
                    );
                  }
                  
                  return null;
                }).filter(Boolean);

                return (
                  <div 
                    key={day.toISOString()} 
                    className={cn(
                      "p-0.5 border-r border-border/30 last:border-r-0 min-h-[28px]",
                      isSameDay(day, new Date()) && "bg-sage-light/20"
                    )}
                  >
                    <div className="space-y-0.5">
                      {cellContent}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

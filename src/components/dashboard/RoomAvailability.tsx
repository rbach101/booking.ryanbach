import { useMemo } from 'react';
import { Room, Booking } from '@/types/booking';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

interface BusyTime {
  start: string;
  end: string;
}

interface CalendarBusyTimes {
  [key: string]: BusyTime[];
}

interface RoomAvailabilityProps {
  rooms: Room[];
  bookings: Booking[];
  selectedDate: string;
  roomBusyTimes?: CalendarBusyTimes;
}

// Hawaii Standard Time is UTC-10
const HAWAII_TIMEZONE = 'Pacific/Honolulu';

// Generate time slots from 8 AM to 7 PM (12 hours) with 12-hour format
const timeSlots = Array.from({ length: 12 }, (_, i) => {
  const hour = i + 8;
  return {
    value: `${hour.toString().padStart(2, '0')}:00`,
    display: format(new Date(2000, 0, 1, hour, 0), 'h a'), // e.g., "8 AM", "1 PM"
  };
});

export function RoomAvailability({ rooms, bookings, selectedDate, roomBusyTimes = {} }: RoomAvailabilityProps) {
  const getBookingsForSlot = (roomId: string, time: string) => {
    const hour = parseInt(time.split(':')[0]);
    return bookings.filter(booking => {
      if (booking.roomId !== roomId || booking.date !== selectedDate) return false;
      const startHour = parseInt(booking.startTime.split(':')[0]);
      const endHour = parseInt(booking.endTime.split(':')[0]);
      return hour >= startHour && hour < endHour;
    });
  };

  // Precompute blocked slots: Set of "roomId:hour" for O(1) lookup instead of O(busyTimes) per cell
  const blockedSlots = useMemo(() => {
    const set = new Set<string>();
    for (const [key, times] of Object.entries(roomBusyTimes)) {
      if (!key.startsWith('room_')) continue;
      const roomId = key.replace('room_', '');
      for (const busy of times) {
        const isAllDay = !busy.start.includes('T');
        if (isAllDay) {
          const startParts = busy.start.split('-').map(Number);
          const endParts = busy.end.split('-').map(Number);
          const eventStart = new Date(startParts[0], startParts[1] - 1, startParts[2]);
          const eventEnd = new Date(endParts[0], endParts[1] - 1, endParts[2]);
          const cursor = new Date(eventStart);
          while (cursor < eventEnd) {
            const dateStr = format(cursor, 'yyyy-MM-dd');
            if (dateStr === selectedDate) {
              for (let h = 8; h < 20; h++) set.add(`${roomId}:${h}`);
            }
            cursor.setDate(cursor.getDate() + 1);
          }
        } else {
          const startDate = toZonedTime(parseISO(busy.start), HAWAII_TIMEZONE);
          const endDate = toZonedTime(parseISO(busy.end), HAWAII_TIMEZONE);
          const busyDateStr = format(startDate, 'yyyy-MM-dd');
          if (busyDateStr !== selectedDate) continue;
          const startHour = startDate.getHours();
          const endHour = endDate.getHours();
          const endMinutes = endDate.getMinutes();
          const effectiveEndHour = endMinutes > 0 ? endHour + 1 : endHour;
          for (let h = startHour; h < effectiveEndHour; h++) {
            if (h >= 8 && h < 20) set.add(`${roomId}:${h}`);
          }
        }
      }
    }
    return set;
  }, [roomBusyTimes, selectedDate]);

  const hasCalendarBusyTime = (roomId: string, time: string): boolean => {
    const hour = parseInt(time.split(':')[0]);
    return blockedSlots.has(`${roomId}:${hour}`);
  };

  return (
    <div className="bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden">
      <div className="px-6 py-4 border-b border-border/50">
        <h3 className="font-display text-lg font-semibold text-card-foreground">Room Availability</h3>
        <p className="text-sm text-muted-foreground mt-1">Today's schedule at a glance (HST)</p>
      </div>
      
      <div className="overflow-x-auto">
        <div className="min-w-[600px] p-4">
          {/* Time header */}
          <div className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 mb-2">
            <div className="text-xs font-medium text-muted-foreground px-2">Room</div>
            {timeSlots.map(slot => (
              <div key={slot.value} className="text-xs text-center text-muted-foreground">
                {slot.display}
              </div>
            ))}
          </div>

          {/* Room rows */}
          {rooms.map((room, roomIndex) => (
            <div 
              key={room.id}
              className="grid grid-cols-[120px_repeat(12,1fr)] gap-1 mb-2 animate-fade-in"
              style={{ animationDelay: `${roomIndex * 100}ms` }}
            >
              <div className="flex items-center gap-2 px-2">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: room.color }}
                />
                <span className="text-sm font-medium text-card-foreground truncate">
                  {room.name}
                </span>
              </div>
              
              {timeSlots.map(slot => {
                const slotBookings = getBookingsForSlot(room.id, slot.value);
                const isBooked = slotBookings.length > 0;
                const isCalendarBlocked = hasCalendarBusyTime(room.id, slot.value);
                
                return (
                  <div
                    key={`${room.id}-${slot.value}`}
                    className={cn(
                      "h-10 rounded-md transition-all duration-200",
                      isBooked 
                        ? "bg-sage shadow-soft" 
                        : isCalendarBlocked
                          ? "bg-amber-200/70 dark:bg-amber-900/40"
                          : "bg-sage-light/50 hover:bg-sage-light"
                    )}
                    title={isBooked ? slotBookings[0]?.clientName : isCalendarBlocked ? 'Blocked (Calendar)' : 'Available'}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      <div className="px-6 py-3 border-t border-border/50 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-sage" />
          <span className="text-xs text-muted-foreground">Booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-amber-200/70 dark:bg-amber-900/40" />
          <span className="text-xs text-muted-foreground">Blocked (Calendar)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-sage-light/50" />
          <span className="text-xs text-muted-foreground">Available</span>
        </div>
      </div>
    </div>
  );
}

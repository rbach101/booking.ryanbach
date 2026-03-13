import { useState, useMemo } from 'react';
import { format, addDays, subDays, isToday, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ChevronLeft, ChevronRight, Clock, User, MapPin, Calendar, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Booking, Practitioner, Room, Service } from '@/types/booking';
import { cn } from '@/lib/utils';
import { useCalendarBusyTimes } from '@/hooks/useCalendarBusyTimes';

interface MobileDayCalendarProps {
  bookings: Booking[];
  practitioners: Practitioner[];
  rooms: Room[];
  services: Service[];
  onBookingClick?: (booking: Booking) => void;
  viewType: 'practitioners' | 'rooms';
  onViewTypeChange?: (v: 'practitioners' | 'rooms') => void;
}

export function MobileDayCalendar({
  bookings,
  practitioners,
  rooms,
  services,
  onBookingClick,
  viewType,
  onViewTypeChange,
}: MobileDayCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const { busyTimes } = useCalendarBusyTimes(currentDate);

  const dayBookings = useMemo(() => {
    return bookings
      .filter(b => b.date === dateStr && b.status !== 'cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [bookings, dateStr]);

  // Get busy blocks for this day
  const dayBusyBlocks = useMemo(() => {
    const blocks: { start: string; end: string; summary: string; resourceName: string; resourceColor: string }[] = [];

    const items = viewType === 'practitioners' ? practitioners : rooms;

    for (const item of items) {
      const busyKey = viewType === 'rooms' ? `room_${item.id}` : item.id;
      const allBusy = busyTimes[busyKey] || [];

      for (const busy of allBusy) {
        const isAllDay = !busy.start.includes('T');
        
        if (isAllDay) {
          // All-day event: check if dateStr falls within the range
          const startParts = busy.start.split('-').map(Number);
          const endParts = busy.end.split('-').map(Number);
          const eventStart = new Date(startParts[0], startParts[1] - 1, startParts[2]);
          const eventEnd = new Date(endParts[0], endParts[1] - 1, endParts[2]); // exclusive
          const currentParts = dateStr.split('-').map(Number);
          const currentDay = new Date(currentParts[0], currentParts[1] - 1, currentParts[2]);
          
          if (currentDay >= eventStart && currentDay < eventEnd) {
            blocks.push({
              start: '08:00',
              end: '20:00',
              summary: (busy as any).summary || 'Blocked',
              resourceName: item.name,
              resourceColor: item.color || '#888',
            });
          }
        } else {
          const busyStart = parseISO(busy.start);
          const busyEnd = parseISO(busy.end);
          const busyStartHawaii = toZonedTime(busyStart, 'Pacific/Honolulu');
          const busyEndHawaii = toZonedTime(busyEnd, 'Pacific/Honolulu');
          const busyDateStr = format(busyStartHawaii, 'yyyy-MM-dd');
          if (busyDateStr !== dateStr) continue;

          blocks.push({
            start: format(busyStartHawaii, 'HH:mm'),
            end: format(busyEndHawaii, 'HH:mm'),
            summary: (busy as any).summary || 'Blocked',
            resourceName: item.name,
            resourceColor: item.color || '#888',
          });
        }
      }
    }

    return blocks.sort((a, b) => a.start.localeCompare(b.start));
  }, [busyTimes, dateStr, viewType, practitioners, rooms]);

  const getPractitioner = (id: string) => practitioners.find(p => p.id === id);
  const getRoom = (id: string) => rooms.find(r => r.id === id);
  const getService = (id: string) => services.find(s => s.id === id);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  // Quick-nav dots for the week
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [currentDate.toDateString()]);

  const hasItems = dayBookings.length > 0 || dayBusyBlocks.length > 0;

  return (
    <div className="space-y-3">
      {/* View toggle */}
      {onViewTypeChange && (
        <Tabs value={viewType} onValueChange={(v) => onViewTypeChange(v as 'practitioners' | 'rooms')}>
          <TabsList className="w-full">
            <TabsTrigger value="practitioners" className="flex-1 gap-1.5 text-xs">
              <User className="w-3.5 h-3.5" />
              Practitioners
            </TabsTrigger>
            <TabsTrigger value="rooms" className="flex-1 gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5" />
              Rooms
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      <div className="bg-card rounded-xl shadow-soft border border-border/50">
        {/* Date nav */}
        <div className="px-4 py-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className={cn(
                "font-display text-lg font-semibold",
                isToday(currentDate) && "text-sage"
              )}>
                {isToday(currentDate) ? 'Today' : format(currentDate, 'EEE')}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(currentDate, 'MMM d, yyyy')}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentDate(d => addDays(d, 1))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Week day dots */}
          <div className="flex justify-center gap-1.5 mt-2">
            {weekDays.map(day => {
              const isSelected = format(day, 'yyyy-MM-dd') === dateStr;
              const isTodayDay = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setCurrentDate(day)}
                  className={cn(
                    "w-8 h-8 rounded-full text-xs font-medium transition-colors flex flex-col items-center justify-center",
                    isSelected
                      ? "bg-sage text-white"
                      : isTodayDay
                        ? "bg-sage-light text-sage"
                        : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  <span className="text-[9px] leading-none">{format(day, 'EEE').charAt(0)}</span>
                  <span className="text-[11px] leading-none font-semibold">{format(day, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Bookings list */}
        <div className="divide-y divide-border/30">
          {!hasItems ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No appointments or events for this day
            </div>
          ) : (
            <>
              {/* Actual bookings */}
              {dayBookings.map(booking => {
                const practitioner = getPractitioner(booking.practitionerId);
                const room = getRoom(booking.roomId);
                const service = getService(booking.serviceType);

                return (
                  <div
                    key={booking.id}
                    onClick={() => onBookingClick?.(booking)}
                    className="px-4 py-3 active:bg-secondary/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-1 self-stretch rounded-full flex-shrink-0 mt-1"
                        style={{ backgroundColor: practitioner?.color || 'hsl(var(--muted))' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-card-foreground truncate">
                            {booking.clientName}
                          </p>
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-medium capitalize flex-shrink-0",
                            booking.status === 'confirmed'
                              ? 'bg-sage-light text-sage'
                              : booking.status === 'completed'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-terracotta-light text-terracotta'
                          )}>
                            {booking.status}
                          </span>
                        </div>
                        {service && (
                          <p className="text-xs text-card-foreground/80 mt-0.5 truncate">
                            {service.name}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(booking.startTime)} – {formatTime(booking.endTime)}
                          </span>
                          {practitioner && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {practitioner.name.split(' ')[0]}
                              {booking.practitioner2Id && (() => {
                                const p2 = getPractitioner(booking.practitioner2Id);
                                return p2 ? ` + ${p2.name.split(' ')[0]}` : '';
                              })()}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {room ? room.name : (!booking.roomId ? 'Outcall' : 'No room')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Busy blocks */}
              {dayBusyBlocks.length > 0 && (
                <>
                  {dayBookings.length > 0 && (
                    <div className="px-4 py-2 bg-muted/30">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Calendar Blocks
                      </p>
                    </div>
                  )}
                  {dayBusyBlocks.map((block, idx) => (
                    <div key={`busy-${idx}`} className="px-4 py-2.5">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-1 self-stretch rounded-full flex-shrink-0 mt-1 opacity-50"
                          style={{ backgroundColor: block.resourceColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Ban className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <p className="text-sm text-muted-foreground truncate">
                              {block.summary}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5 text-xs text-muted-foreground/70">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(block.start)} – {formatTime(block.end)}
                            </span>
                            <span>{block.resourceName}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Today button */}
        {!isToday(currentDate) && (
          <div className="px-4 py-2 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-sage"
              onClick={() => setCurrentDate(new Date())}
            >
              Go to Today
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

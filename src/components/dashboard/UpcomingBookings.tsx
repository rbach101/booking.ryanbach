import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';
import { Clock, User, MapPin, CalendarCheck } from 'lucide-react';
import { Booking, Practitioner, Room } from '@/types/booking';
import { cn } from '@/lib/utils';

interface UpcomingBookingsProps {
  bookings: Booking[];
  practitioners: Practitioner[];
  rooms: Room[];
  onBookingClick?: (booking: Booking) => void;
}

export function UpcomingBookings({ bookings, practitioners, rooms, onBookingClick }: UpcomingBookingsProps) {
  const getPractitioner = (id: string) => practitioners.find(p => p.id === id);
  const getRoom = (id: string) => rooms.find(r => r.id === id);

  const sortedBookings = [...bookings]
    .filter(b => b.status !== 'cancelled' && b.status !== 'completed')
    .sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.startTime}`);
      const dateB = new Date(`${b.date}T${b.startTime}`);
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 5);

  const getStatusStyles = (status: Booking['status']) => {
    switch (status) {
      case 'confirmed':
        return 'bg-sage-light text-sage';
      case 'pending':
        return 'bg-terracotta-light text-terracotta';
      case 'cancelled':
        return 'bg-destructive/10 text-destructive';
      case 'completed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="bg-card rounded-xl shadow-soft border border-border/50 transition-shadow duration-200 hover:shadow-medium">
      <div className="px-6 py-4 border-b border-border/50">
        <h3 className="font-display text-lg font-semibold text-card-foreground">Upcoming Bookings</h3>
      </div>
      <div className="divide-y divide-border/50">
        {sortedBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-sage-light flex items-center justify-center mb-4">
              <CalendarCheck className="w-7 h-7 text-sage" />
            </div>
            <p className="font-medium text-card-foreground mb-1">No upcoming bookings</p>
            <p className="text-sm text-muted-foreground">New bookings will appear here when they arrive</p>
          </div>
        ) : sortedBookings.map((booking, index) => {
          const practitioner = getPractitioner(booking.practitionerId);
          const practitioner2 = booking.practitioner2Id ? getPractitioner(booking.practitioner2Id) : null;
          const room = getRoom(booking.roomId);

          return (
            <button
              key={booking.id}
              type="button"
              onClick={() => onBookingClick?.(booking)}
              className="w-full text-left px-6 py-4 hover:bg-muted/40 transition-colors duration-200 ease-out animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-card-foreground truncate">
                      {booking.clientName}
                    </p>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                      getStatusStyles(booking.status)
                    )}>
                      {booking.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {booking.serviceType}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {format(parseLocalDate(booking.date), 'MMM d')}, {format(new Date(`${booking.date}T${booking.startTime}`), 'h:mm a')}
                    </span>
                    {practitioner && (
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {practitioner2
                          ? `${practitioner.name} & ${practitioner2.name}`
                          : practitioner.name}
                      </span>
                    )}
                    {room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        {room.name}
                      </span>
                    )}
                  </div>
                </div>
                <div 
                  className="w-1 h-12 rounded-full flex-shrink-0"
                  style={{ backgroundColor: practitioner?.color || 'hsl(var(--muted))' }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

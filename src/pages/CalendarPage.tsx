import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { WeekCalendar } from '@/components/calendar/WeekCalendar';
import { MobileDayCalendar } from '@/components/calendar/MobileDayCalendar';
import { NewBookingDialog } from '@/components/booking/NewBookingDialog';
import { BookingDetailsDialog } from '@/components/calendar/BookingDetailsDialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Home, Loader2 } from 'lucide-react';
import { Booking } from '@/types/booking';
import { usePractitioners } from '@/hooks/usePractitioners';
import { useCalendarBookings } from '@/hooks/useCalendarBookings';
import { useRooms, useServices } from '@/hooks/useCalendarResources';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';

export default function CalendarPage() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [viewType, setViewType] = useState<'practitioners' | 'rooms'>('practitioners');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const { data: practitioners = [], isLoading: loadingPractitioners } = usePractitioners();
  const { data: rooms = [], isLoading: loadingRooms } = useRooms();
  const { data: services = [], isLoading: loadingServices } = useServices();
  const { data: bookings = [], isLoading: loadingBookings } = useCalendarBookings();

  const loading = loadingPractitioners || loadingRooms || loadingServices || loadingBookings;

  const handleBookingClick = (booking: Booking) => {
    setSelectedBooking(booking);
    setDetailsDialogOpen(true);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-sage" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">Calendar</h1>
            <p className="text-muted-foreground text-sm mt-1">View and manage appointments</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {!isMobile && (
              <Tabs value={viewType} onValueChange={(v) => setViewType(v as typeof viewType)}>
                <TabsList>
                  <TabsTrigger value="practitioners" className="gap-2">
                    <Users className="w-4 h-4" />
                    By Practitioner
                  </TabsTrigger>
                  <TabsTrigger value="rooms" className="gap-2">
                    <Home className="w-4 h-4" />
                    By Room
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <NewBookingDialog
              practitioners={practitioners}
              rooms={rooms}
              services={services}
              existingBookings={bookings}
              onBookingCreate={() => queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] })}
              trigger={
                <Button variant="sage" size={isMobile ? 'sm' : 'default'} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {isMobile ? 'New' : 'New Booking'}
                </Button>
              }
            />
          </div>
        </div>

        {isMobile ? (
          <MobileDayCalendar
            bookings={bookings}
            practitioners={practitioners}
            rooms={rooms}
            services={services}
            viewType={viewType}
            onViewTypeChange={(v) => setViewType(v)}
            onBookingClick={handleBookingClick}
          />
        ) : (
          <WeekCalendar
            bookings={bookings}
            practitioners={practitioners}
            rooms={rooms}
            viewType={viewType}
            onBookingClick={handleBookingClick}
          />
        )}

        <BookingDetailsDialog
          booking={selectedBooking}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          practitioners={practitioners}
          rooms={rooms}
          services={services}
          onBookingDelete={() => queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] })}
        />
      </div>
    </MainLayout>
  );
}

import { useState, useEffect, useRef } from 'react';
import { trackBookingApproved, trackBookingCancelled } from '@/lib/klaviyo';
import { useAuditLog } from '@/hooks/useAuditLog';
import { format } from 'date-fns';
import { Search, Filter, MoreHorizontal, Check, X, Clock, Trash2, CheckCircle2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { NewBookingDialog } from '@/components/booking/NewBookingDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { cn, parseLocalDate } from '@/lib/utils';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { Practitioner, Room, Service, Booking } from '@/types/booking';
import { BookingDetailsDialog } from '@/components/calendar/BookingDetailsDialog';
import { useQueryClient } from '@tanstack/react-query';

type BookingStatus = 'pending' | 'pending_approval' | 'confirmed' | 'cancelled' | 'completed' | 'checked-in';

interface BookingData {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  notes: string | null;
  practitioner_id: string | null;
  practitioner_2_id: string | null;
  room_id: string | null;
  service_id: string | null;
  total_amount: number | null;
  created_at: string;
}

interface DisplayPractitioner {
  id: string;
  name: string;
  color: string | null;
}

interface DisplayRoom {
  id: string;
  name: string;
  color: string | null;
}

export default function BookingsPage() {
  const { logAction } = useAuditLog();
  const queryClient = useQueryClient();
  const auditLogged = useRef(false);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [practitioners, setPractitioners] = useState<Practitioner[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bookingToDelete, setBookingToDelete] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  useEffect(() => {
    fetchData();
    if (!auditLogged.current) {
      auditLogged.current = true;
      logAction({ action: 'view', resourceType: 'booking', details: { page: 'bookings_list' } });
    }
  }, []);

  const fetchData = async () => {
    try {
      const [bookingsRes, practitionersRes, roomsRes, servicesRes] = await Promise.all([
        supabase.from('bookings').select('*').order('booking_date', { ascending: false }),
        supabase.from('practitioners').select('*'),
        supabase.from('rooms').select('*'),
        supabase.from('services').select('*'),
      ]);

      if (bookingsRes.data) setBookings(bookingsRes.data);
      if (practitionersRes.data) {
        setPractitioners(practitionersRes.data.map(p => ({
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone || '',
          specialties: p.specialties || [],
          color: p.color || '#6b7280',
          bio: p.bio || undefined,
          availability: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] }
        })));
      }
      if (roomsRes.data) {
        setRooms(roomsRes.data.map(r => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          capacity: r.capacity || 1,
          amenities: r.amenities || [],
          color: r.color || '#6b7280',
          isActive: r.is_active ?? true
        })));
      }
      if (servicesRes.data) {
        setServices(servicesRes.data.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description || '',
          price: s.price,
          duration: s.duration,
          category: s.category || '',
          practitionerIds: s.practitioner_ids || [],
          is_couples: s.is_couples ?? false,
        })));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const getPractitioner = (id: string | null) => practitioners.find(p => p.id === id);
  const getRoom = (id: string | null) => rooms.find(r => r.id === id);
  const getService = (id: string | null) => services.find(s => s.id === id);

  const filteredBookings = bookings.filter(booking =>
    booking.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    booking.client_email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime12 = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    if (Number.isNaN(hour)) return time;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const handleBookingCreate = async (bookingData: any) => {
    await fetchData(); // Refresh the list
  };

  const updateBookingStatus = async (id: string, status: BookingStatus) => {
    // Delete Google Calendar event BEFORE updating status for speed
    if (status === 'cancelled') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          supabase.functions.invoke('google-calendar-sync', {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { action: 'delete-event', bookingId: id },
          }).catch(err => console.error('Calendar sync error (non-blocking):', err));
        }
      } catch (err) {
        console.error('Calendar sync error (non-blocking):', err);
      }
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id);

    if (error) {
      toast.error('Failed to update booking status');
      return;
    }
    debugLog('BookingsPage.tsx:bookings.update', 'Booking status updated', { booking_id: id, status });

    setBookings(prev => 
      prev.map(b => b.id === id ? { ...b, status } : b)
    );
    toast.success(`Booking ${status}`);
  };

  const handleCheckIn = async (bookingId: string) => {
    try {
      toast.info('Processing check-in...');
      
      // Try to auto-charge the balance
      const { data: { session } } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('charge-balance', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: { bookingId }
      });

      if (response.error) {
        const msg = await getFunctionErrorMessage(response.error);
        toast.error(msg || 'Balance charge failed');
        console.error('Balance charge error:', response.error);
        // Still allow check-in even if charge fails
      } else if (response.data?.paymentLinkSent) {
        // Card couldn't be charged — payment link was emailed to customer
        toast.success(response.data?.message || 'Payment link sent to customer — they can complete payment at their convenience.');
        if (response.data?.url) window.open(response.data.url, '_blank');
      } else if (response.data?.success) {
        toast.success('Balance charged successfully!');
      }

      // Update status to checked-in
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'checked-in' })
        .eq('id', bookingId);

      if (error) throw error;
      debugLog('BookingsPage.tsx:bookings.update', 'Booking checked in', { booking_id: bookingId });

      setBookings(prev =>
        prev.map(b => b.id === bookingId ? { ...b, status: 'checked-in' } : b)
      );

      // Notify staff
      try {
        const booking = bookings.find(b => b.id === bookingId);
        if (booking) {
          await supabase.functions.invoke('notify-checkin', {
            body: {
              bookingId,
              clientName: booking.client_name,
              serviceName: services.find(s => s.id === booking.service_id)?.name || 'Appointment',
              startTime: booking.start_time,
              practitionerId: booking.practitioner_id,
            }
          });
        }
      } catch (e) {
        console.error('Notification error (non-blocking):', e);
      }

      toast.success('Customer checked in successfully!');
    } catch (error) {
      console.error('Check-in error:', error);
      toast.error('Failed to check in customer');
    }
  };

  const handleApproval = async (bookingId: string, action: 'approve' | 'decline') => {
    try {
      const response = await supabase.functions.invoke('approve-booking', {
        body: { bookingId, action }
      });

      if (response.error) {
        const message = await getFunctionErrorMessage(response.error);
        toast.error(message || `Failed to ${action} booking`);
        return;
      }

      const result = response.data;
      const newStatus = action === 'approve' ? 'confirmed' : 'cancelled';
      setBookings(prev => 
        prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b)
      );

      // Track in Klaviyo
      const booking = bookings.find(b => b.id === bookingId);
      if (booking) {
        const serviceName = services.find(s => s.id === booking.service_id)?.name || 'Appointment';
        const practitionerName = practitioners.find(p => p.id === booking.practitioner_id)?.name || null;
        if (action === 'approve') {
          trackBookingApproved({
            bookingId: booking.id,
            clientName: booking.client_name,
            clientEmail: booking.client_email,
            clientPhone: booking.client_phone,
            serviceName,
            bookingDate: booking.booking_date,
            startTime: booking.start_time,
            practitionerName,
          });
        } else {
          trackBookingCancelled({
            bookingId: booking.id,
            clientEmail: booking.client_email,
            serviceName,
            bookingDate: booking.booking_date,
          });
        }
      }

      if (action === 'approve' && result?.paymentLinkSent) {
        toast.success('Booking approved — deposit payment link sent to client');
        if (result?.paymentLinkUrl) {
          window.open(result.paymentLinkUrl, '_blank');
        }
      } else if (action === 'approve' && result?.depositCharged) {
        toast.success('Booking approved & deposit charged successfully');
      } else {
        toast.success(`Booking ${action === 'approve' ? 'approved' : 'declined'} - client notified`);
      }
    } catch (error) {
      console.error('Approval error:', error);
      toast.error(`Failed to ${action} booking`);
    }
  };

  const handleDeleteBooking = async () => {
    if (!bookingToDelete) return;

    // Delete Google Calendar event first (before DB delete removes the google_event_id)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.functions.invoke('google-calendar-sync', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { action: 'delete-event', bookingId: bookingToDelete },
        });
      }
    } catch (err) {
      console.error('Calendar sync error (non-blocking):', err);
    }

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingToDelete);

    if (error) {
      toast.error('Failed to delete booking');
      return;
    }

    setBookings(prev => prev.filter(b => b.id !== bookingToDelete));
    setDeleteDialogOpen(false);
    setBookingToDelete(null);
    toast.success('Booking deleted');
  };

  const openDeleteDialog = (bookingId: string) => {
    setBookingToDelete(bookingId);
    setDeleteDialogOpen(true);
  };

  const getStatusBadge = (status: BookingStatus) => {
    const styles: Record<BookingStatus, string> = {
      confirmed: 'bg-sage-light text-sage border-sage/20',
      pending: 'bg-terracotta-light text-terracotta border-terracotta/20',
      pending_approval: 'bg-amber-100 text-amber-700 border-amber-200',
      cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
      completed: 'bg-muted text-muted-foreground border-border',
      'checked-in': 'bg-blue-100 text-blue-700 border-blue-200',
    };

    const icons: Record<BookingStatus, JSX.Element> = {
      confirmed: <Check className="w-3 h-3" />,
      pending: <Clock className="w-3 h-3" />,
      pending_approval: <Clock className="w-3 h-3" />,
      cancelled: <X className="w-3 h-3" />,
      completed: <Check className="w-3 h-3" />,
      'checked-in': <CheckCircle2 className="w-3 h-3" />,
    };

    const labels: Record<BookingStatus, string> = {
      confirmed: 'Confirmed',
      pending: 'Pending',
      pending_approval: 'Awaiting Approval',
      cancelled: 'Cancelled',
      completed: 'Completed',
      'checked-in': 'Checked In',
    };

    return (
      <Badge variant="outline" className={cn("gap-1", styles[status])}>
        {icons[status]}
        {labels[status]}
      </Badge>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Bookings
            </h1>
            <p className="text-muted-foreground mt-1">
              View and manage all appointments
            </p>
          </div>
          <NewBookingDialog
            practitioners={practitioners}
            rooms={rooms}
            services={services}
            existingBookings={bookings.map(b => ({
              id: b.id,
              clientName: b.client_name,
              clientEmail: b.client_email,
              clientPhone: b.client_phone || '',
              practitionerId: b.practitioner_id || '',
              practitioner2Id: b.practitioner_2_id || null,
              roomId: b.room_id || '',
              serviceType: b.service_id || '',
              date: b.booking_date,
              startTime: b.start_time,
              endTime: b.end_time,
              status: (b.status || 'pending') as Booking['status'],
              notes: b.notes || undefined,
              createdAt: b.created_at
            }))}
            onBookingCreate={handleBookingCreate}
          />
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search bookings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead>Client</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Practitioner</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading bookings...
                  </TableCell>
                </TableRow>
              ) : filteredBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No bookings found
                  </TableCell>
                </TableRow>
              ) : filteredBookings.map((booking, index) => {
                const practitioner = getPractitioner(booking.practitioner_id);
                const room = getRoom(booking.room_id);
                const service = getService(booking.service_id);
                
                return (
                  <TableRow 
                    key={booking.id}
                    className="animate-fade-in cursor-pointer hover:bg-muted/50"
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => {
                      setSelectedBooking({
                        id: booking.id,
                        clientName: booking.client_name,
                        clientEmail: booking.client_email,
                        clientPhone: booking.client_phone || '',
                        practitionerId: booking.practitioner_id || '',
                        practitioner2Id: booking.practitioner_2_id || null,
                        roomId: booking.room_id || '',
                        serviceType: booking.service_id || '',
                        date: booking.booking_date,
                        startTime: booking.start_time,
                        endTime: booking.end_time,
                        status: (booking.status || 'pending') as Booking['status'],
                        notes: booking.notes || undefined,
                        createdAt: booking.created_at,
                      });
                      setDetailsDialogOpen(true);
                    }}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-card-foreground">
                          {booking.client_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {booking.client_email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-card-foreground">
                      {service?.name || 'Unknown Service'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-card-foreground">
                          {format(parseLocalDate(booking.booking_date), 'MMM d, yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatTime12(booking.start_time)} - {formatTime12(booking.end_time)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {practitioner && (
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: practitioner.color }}
                          />
                          <span className="text-card-foreground">{practitioner.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {room && (
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: room.color }}
                          />
                          <span className="text-card-foreground">{room.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {getStatusBadge((booking.status || 'pending') as BookingStatus)}
                        {booking.status === 'pending_approval' && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="sage"
                              className="h-7 px-2"
                              onClick={() => handleApproval(booking.id, 'approve')}
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-destructive hover:text-destructive"
                              onClick={() => handleApproval(booking.id, 'decline')}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {booking.status !== 'pending_approval' && (
                            <>
                              <DropdownMenuItem 
                                onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                              >
                                <Check className="w-4 h-4 mr-2" />
                                Confirm
                              </DropdownMenuItem>
                              {(booking.status === 'confirmed' || booking.status === 'pending') && (
                                <DropdownMenuItem 
                                  onClick={() => handleCheckIn(booking.id)}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Check In Customer
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                onClick={() => updateBookingStatus(booking.id, 'completed')}
                              >
                                <Check className="w-4 h-4 mr-2" />
                                Mark Complete
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem 
                            onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                            className="text-destructive"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => openDeleteDialog(booking.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this booking? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteBooking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BookingDetailsDialog
        booking={selectedBooking}
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        practitioners={practitioners}
        rooms={rooms}
        services={services}
        onBookingDelete={() => {
          fetchData();
          queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
        }}
      />
    </MainLayout>
  );
}

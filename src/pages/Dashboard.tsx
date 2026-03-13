import { format, subWeeks, startOfWeek, endOfWeek } from 'date-fns';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Calendar, Users, Clock, DollarSign, Plus, BookOpen, Lock, CreditCard, Sparkles, MoreHorizontal, Leaf, CheckCircle, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { UpcomingBookings } from '@/components/dashboard/UpcomingBookings';
import { PendingApprovals } from '@/components/dashboard/PendingApprovals';
import { NewBookingDialog } from '@/components/booking/NewBookingDialog';
import { PractitionerCard } from '@/components/practitioners/PractitionerCard';
import { EditPractitionerDialog } from '@/components/practitioners/EditPractitionerDialog';
import { ScheduleDialog } from '@/components/practitioners/ScheduleDialog';
import { StaffTutorial, useStaffTutorial } from '@/components/dashboard/StaffTutorial';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { PasswordChangeDialog } from '@/components/auth/PasswordChangeDialog';
import { useCalendarBusyTimes } from '@/hooks/useCalendarBusyTimes';
import { POSChargeDialog } from '@/components/pos/POSChargeDialog';
import { SellMembershipDialog } from '@/components/memberships/SellMembershipDialog';
import { RecentIntakeForms } from '@/components/dashboard/RecentIntakeForms';
import { BookingDetailsDialog } from '@/components/calendar/BookingDetailsDialog';
import type { Booking as BookingType } from '@/types/booking';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Lazy load heavy dashboard sections not needed on first paint
const RoomAvailabilityLazy = lazy(() => import('@/components/dashboard/RoomAvailability').then(m => ({ default: m.RoomAvailability })));
const BalancePayments = lazy(() => import('@/components/dashboard/BalancePayments').then(m => ({ default: m.BalancePayments })));
const PaymentTrackerLazy = lazy(() => import('@/components/dashboard/PaymentTracker').then(m => ({ default: m.PaymentTracker })));

export default function Dashboard() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { user, isAdmin, requiresPasswordChange, clearPasswordChangeRequired } = useAuth();
  const queryClient = useQueryClient();
  const { showTutorial, openTutorial, closeTutorial } = useStaffTutorial();
  const isMobile = useIsMobile();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [posDialogOpen, setPosDialogOpen] = useState(false);
  const [sellMembershipOpen, setSellMembershipOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingType | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Fetch current user's practitioner record (for staff view)
  const { data: myPractitioner } = useQuery({
    queryKey: ['my-practitioner', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch recent and upcoming bookings (last 35 days + next 35 days for date range support)
  const dateRangeStart = format(new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
  const dateRangeEnd = format(new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');

  // Fetch previous week for trend comparison
  const prevWeekStart = format(startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const prevWeekEnd = format(endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 0 }), 'yyyy-MM-dd');

  const { data: prevWeekBookings = [] } = useQuery({
    queryKey: ['dashboard-prev-week', prevWeekStart, prevWeekEnd, myPractitioner?.id, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select('*')
        .gte('booking_date', prevWeekStart)
        .lte('booking_date', prevWeekEnd);
      if (!isAdmin && myPractitioner?.id) {
        query = query.eq('practitioner_id', myPractitioner.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // Fetch bookings from database
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ['dashboard-bookings', myPractitioner?.id, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('bookings')
        .select('*')
        .gte('booking_date', dateRangeStart)
        .lte('booking_date', dateRangeEnd)
        .order('booking_date', { ascending: true })
        .order('start_time', { ascending: true });
      
      // Staff only see their own bookings
      if (!isAdmin && myPractitioner?.id) {
        query = query.eq('practitioner_id', myPractitioner.id);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Fetch practitioners from database
  const { data: practitioners = [], isLoading: practitionersLoading } = useQuery({
    queryKey: ['dashboard-practitioners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch rooms from database
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['dashboard-rooms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch all services (including inactive) for name lookups on existing bookings
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ['dashboard-services'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingDemoSignups = [], refetch: refetchDemoSignups } = useQuery({
    queryKey: ['demo-signups-pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('demo_signups')
        .select('*')
        .eq('status', 'pending')
        .not('approval_token', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const [approvingDemo, setApprovingDemo] = useState<string | null>(null);
  const [rejectingDemo, setRejectingDemo] = useState<string | null>(null);

  const handleApproveDemo = async (token: string) => {
    setApprovingDemo(token);
    try {
      const { data, error } = await supabase.functions.invoke('approve-demo', {
        body: { token, action: 'approve' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success('Demo approved. They will receive their credentials via email.');
      refetchDemoSignups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve demo');
    } finally {
      setApprovingDemo(null);
    }
  };

  const handleRejectDemo = async (token: string) => {
    setRejectingDemo(token);
    try {
      const { data, error } = await supabase.functions.invoke('approve-demo', {
        body: { token, action: 'reject' },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success('Demo request rejected');
      refetchDemoSignups();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject demo');
    } finally {
      setRejectingDemo(null);
    }
  };

  const isLoading = bookingsLoading || practitionersLoading || roomsLoading || servicesLoading;

  // Calculate stats from real data
  const todaysBookings = bookings.filter(b => b.booking_date === today && b.status !== 'cancelled');
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  const pendingBookings = bookings.filter(b => b.status === 'pending' || b.status === 'pending_approval');
  
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
  };
  
  // Revenue: exclude insurance-covered massages (tracked separately)
  const totalRevenue = bookings
    .filter(b => (b.status === 'confirmed' || b.status === 'completed') && !b.is_insurance_booking)
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const prevWeekRevenue = prevWeekBookings
    .filter(b => (b.status === 'confirmed' || b.status === 'completed') && !b.is_insurance_booking)
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);
  const prevWeekConfirmed = prevWeekBookings.filter(b => b.status === 'confirmed').length;
  const revenueTrend = prevWeekRevenue > 0
    ? Math.round(((totalRevenue - prevWeekRevenue) / prevWeekRevenue) * 100)
    : totalRevenue > 0 ? 100 : 0;
  const confirmedTrend = prevWeekConfirmed > 0
    ? Math.round(((confirmedBookings.length - prevWeekConfirmed) / prevWeekConfirmed) * 100)
    : confirmedBookings.length > 0 ? 100 : 0;

  // Transform bookings to match the component interface
  const transformedBookings = bookings.map(b => ({
    id: b.id,
    clientName: b.client_name,
    clientEmail: b.client_email,
    clientPhone: b.client_phone || '',
    practitionerId: b.practitioner_id || '',
    practitioner2Id: b.practitioner_2_id || null,
    roomId: b.room_id || '',
    serviceType: services.find(s => s.id === b.service_id)?.name || 'Unknown Service',
    date: b.booking_date,
    startTime: b.start_time,
    endTime: b.end_time,
    status: (b.status || 'pending') as 'pending' | 'pending_approval' | 'confirmed' | 'cancelled' | 'completed',
    notes: b.notes || undefined,
    approvedByPractitioner1: b.approved_by_practitioner_1 || null,
    approvedByPractitioner2: b.approved_by_practitioner_2 || null,
    createdAt: b.created_at,
  }));

  // Transform practitioners to match the component interface
  const transformedPractitioners = practitioners.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone || '',
    specialties: p.specialties || [],
    color: p.color || 'hsl(150, 35%, 45%)',
    bio: p.bio || undefined,
    image: p.image_url || undefined,
    availability: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
  }));

  // Transform rooms to match the component interface
  const transformedRooms = rooms.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    capacity: r.capacity || 1,
    amenities: r.amenities || [],
    color: r.color || 'hsl(200, 60%, 55%)',
    isActive: r.is_active ?? true,
  }));

  // Transform services to match the component interface
  // Only active services for booking dialogs
  const transformedServices = services
    .filter(s => s.is_active)
    .map(s => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      price: Number(s.price),
      description: s.description || '',
      category: s.category || 'General',
      practitionerIds: s.practitioner_ids || [],
      is_couples: s.is_couples ?? false,
    }));

  // Get transformed version of my practitioner for staff view
  const myTransformedPractitioner = myPractitioner ? {
    id: myPractitioner.id,
    name: myPractitioner.name,
    email: myPractitioner.email,
    phone: myPractitioner.phone || '',
    specialties: myPractitioner.specialties || [],
    color: myPractitioner.color || 'hsl(150, 35%, 45%)',
    bio: myPractitioner.bio || undefined,
    image: myPractitioner.image_url || undefined,
    availability: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
  } : null;

  const handleOpenBookingDetails = (booking: BookingType) => {
    setSelectedBooking(booking);
    setDetailsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Skeleton className="h-9 w-48" />
              <Skeleton className="h-5 w-32 mt-1" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
        </div>
      </MainLayout>
    );
  }

  // Staff Dashboard View
  if (!isAdmin) {
    return (
      <MainLayout>
        <PasswordChangeDialog open={requiresPasswordChange || showPasswordDialog} onPasswordChanged={() => { clearPasswordChangeRequired(); setShowPasswordDialog(false); }} forced={requiresPasswordChange} />
        <StaffTutorial open={showTutorial} onClose={closeTutorial} />
        <div className="space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Welcome Back{myPractitioner ? `, ${myPractitioner.name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <MoreHorizontal className="w-4 h-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setShowPasswordDialog(true)}>
                    <Lock className="w-4 h-4 mr-2" />
                    Change Password
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={openTutorial}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    Help Guide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPosDialogOpen(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Charge
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSellMembershipOpen(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Sell Membership
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="outline" className="gap-2" onClick={() => setShowPasswordDialog(true)}>
                  <Lock className="w-4 h-4" />
                  Change Password
                </Button>
                <Button variant="outline" className="gap-2" onClick={openTutorial}>
                  <BookOpen className="w-4 h-4" />
                  Help Guide
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setPosDialogOpen(true)}>
                  <CreditCard className="w-4 h-4" />
                  Charge
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setSellMembershipOpen(true)}>
                  <Sparkles className="w-4 h-4" />
                  Sell Membership
                </Button>
              </>
            )}
            <NewBookingDialog
              practitioners={transformedPractitioners}
              rooms={transformedRooms}
              services={transformedServices}
              existingBookings={transformedBookings}
              trigger={
                <Button variant="sage" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Booking
                </Button>
              }
            />
          </div>
          </div>

          {/* Custom Tailored Notice */}
          <Card className="border-sage/30 bg-sage/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage/15">
                <Leaf className="h-5 w-5 text-sage" />
              </div>
              <div>
                <p className="font-medium text-foreground">Built for your business</p>
                <p className="text-sm text-muted-foreground">Every feature is custom tailored to your specific business needs — from services and workflows to branding and integrations.</p>
              </div>
            </CardContent>
          </Card>

          {/* Pending Approvals - First thing staff sees */}
          <PendingApprovals
            bookings={transformedBookings}
            practitioners={transformedPractitioners}
            onRefresh={handleRefresh}
          />

          {/* Staff Stats - Only their own data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Today's Appointments"
              value={todaysBookings.length}
              subtitle="scheduled for today"
              icon={<Calendar className="w-6 h-6 text-sage" />}
              href="/calendar"
            />
            <StatsCard
              title="Upcoming Bookings"
              value={confirmedBookings.length}
              subtitle="confirmed"
              icon={<Clock className="w-6 h-6 text-sage" />}
              href="/bookings"
            />
            <StatsCard
              title="Pending Requests"
              value={pendingBookings.length}
              subtitle="awaiting confirmation"
              icon={<Users className="w-6 h-6 text-sage" />}
              href="#pending-approvals"
            />
            <StatsCard
              title="Revenue"
              value={`$${totalRevenue.toLocaleString()}`}
              subtitle="confirmed bookings"
              icon={<DollarSign className="w-6 h-6 text-sage" />}
              href="/bookings"
            />
          </div>

          {/* Staff Practitioner Card */}
          {myTransformedPractitioner && (
            <div className="space-y-4">
              <h2 className="font-display text-xl font-semibold text-foreground">Your Profile</h2>
              <div className="max-w-md">
                <PractitionerCard 
                  practitioner={myTransformedPractitioner}
                  onEditInfo={() => setEditProfileOpen(true)}
                  onEditSchedule={() => setScheduleDialogOpen(true)}
                />
              </div>
            </div>
          )}

          {myTransformedPractitioner && (
            <>
              <EditPractitionerDialog
                open={editProfileOpen}
                onOpenChange={setEditProfileOpen}
                practitioner={myTransformedPractitioner}
                onSaved={() => queryClient.invalidateQueries({ queryKey: ['my-practitioner'] })}
              />
              <ScheduleDialog
                open={scheduleDialogOpen}
                onOpenChange={setScheduleDialogOpen}
                practitionerId={myTransformedPractitioner.id}
                practitionerName={myTransformedPractitioner.name}
              />
            </>
          )}

          <POSChargeDialog open={posDialogOpen} onOpenChange={setPosDialogOpen} />
          <SellMembershipDialog open={sellMembershipOpen} onOpenChange={setSellMembershipOpen} />

          {/* Balance Payments - Staff can manually charge clients */}
          <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
            <BalancePayments 
              bookings={bookings} 
              onRefresh={handleRefresh}
            />
          </Suspense>

          {/* Payment Tracker */}
          <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
            <PaymentTrackerLazy practitionerId={myPractitioner?.id} />
          </Suspense>

          {/* Recent Intake Forms */}
          <RecentIntakeForms />

          {/* Main Content */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <UpcomingBookings 
              bookings={transformedBookings}
              practitioners={transformedPractitioners}
              rooms={transformedRooms}
              onBookingClick={handleOpenBookingDetails}
            />
            {!isMobile && (
              <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
                <RoomAvailabilityWrapper
                  rooms={transformedRooms}
                  bookings={transformedBookings}
                  selectedDate={today}
                />
              </Suspense>
            )}
          </div>
        </div>
      </MainLayout>
    );
  }

  // Admin Dashboard View
  return (
    <MainLayout>
      <PasswordChangeDialog open={requiresPasswordChange} onPasswordChanged={clearPasswordChangeRequired} />
      <StaffTutorial open={showTutorial} onClose={closeTutorial} />
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Welcome Back
            </h1>
            <p className="text-muted-foreground mt-1">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isMobile ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <MoreHorizontal className="w-4 h-4" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openTutorial}>
                    <BookOpen className="w-4 h-4 mr-2" />
                    Help Guide
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPosDialogOpen(true)}>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Charge
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSellMembershipOpen(true)}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Sell Membership
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button variant="outline" className="gap-2" onClick={openTutorial}>
                  <BookOpen className="w-4 h-4" />
                  Help Guide
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setPosDialogOpen(true)}>
                  <CreditCard className="w-4 h-4" />
                  Charge
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => setSellMembershipOpen(true)}>
                  <Sparkles className="w-4 h-4" />
                  Sell Membership
                </Button>
              </>
            )}
            <NewBookingDialog
              practitioners={transformedPractitioners}
              rooms={transformedRooms}
              services={transformedServices}
              existingBookings={transformedBookings}
              trigger={
                <Button variant="sage" className="gap-2">
                  <Plus className="w-4 h-4" />
                  New Booking
                </Button>
              }
            />
          </div>
        </div>

        {/* Custom Tailored Notice */}
        <Card className="border-sage/30 bg-sage/5">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage/15">
              <Leaf className="h-5 w-5 text-sage" />
            </div>
            <div>
              <p className="font-medium text-foreground">Built for your business</p>
              <p className="text-sm text-muted-foreground">Every feature is custom tailored to your specific business needs — from services and workflows to branding and integrations.</p>
            </div>
          </CardContent>
        </Card>

        {/* Pending Demo Requests */}
        {pendingDemoSignups.length > 0 && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-foreground">Demo Requests</h3>
                <Badge variant="secondary">{pendingDemoSignups.length}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">People who requested a demo from the landing page. Approve to send them login credentials.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pendingDemoSignups.map((d: { id: string; name: string; email: string; business_name?: string; approval_token: string }) => (
                  <div
                    key={d.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg bg-background/80 border border-border"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{d.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{d.email}</p>
                      {d.business_name && <p className="text-xs text-muted-foreground truncate">{d.business_name}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-sage hover:bg-sage/90"
                        onClick={() => handleApproveDemo(d.approval_token)}
                        disabled={approvingDemo === d.approval_token || rejectingDemo === d.approval_token}
                      >
                        {approvingDemo === d.approval_token ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRejectDemo(d.approval_token)}
                        disabled={approvingDemo === d.approval_token || rejectingDemo === d.approval_token}
                      >
                        {rejectingDemo === d.approval_token ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Approvals */}
        <PendingApprovals
          bookings={transformedBookings}
          practitioners={transformedPractitioners}
          onRefresh={handleRefresh}
        />

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Today's Appointments"
            value={todaysBookings.length}
            subtitle="scheduled for today"
            icon={<Calendar className="w-6 h-6 text-sage" />}
            href="/calendar"
          />
          <StatsCard
            title="Confirmed Bookings"
            value={confirmedBookings.length}
            subtitle="total confirmed"
            icon={<Clock className="w-6 h-6 text-sage" />}
            href="/bookings"
            trend={confirmedTrend !== 0 ? { value: Math.abs(confirmedTrend), isPositive: confirmedTrend >= 0 } : undefined}
          />
          <StatsCard
            title="Pending Requests"
            value={pendingBookings.length}
            subtitle="awaiting confirmation"
            icon={<Users className="w-6 h-6 text-sage" />}
            href="#pending-approvals"
          />
          <StatsCard
            title="Revenue"
            value={`$${totalRevenue.toLocaleString()}`}
            subtitle="confirmed bookings"
            icon={<DollarSign className="w-6 h-6 text-sage" />}
            href="/bookings"
            trend={revenueTrend !== 0 ? { value: Math.abs(revenueTrend), isPositive: revenueTrend >= 0 } : undefined}
          />
        </div>

        <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
          <BalancePayments 
            bookings={bookings} 
            onRefresh={handleRefresh}
          />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
          <PaymentTrackerLazy />
        </Suspense>

        {/* Recent Intake Forms */}
        <RecentIntakeForms />

        {/* Main Content */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <UpcomingBookings 
            bookings={transformedBookings}
            practitioners={transformedPractitioners}
            rooms={transformedRooms}
            onBookingClick={handleOpenBookingDetails}
          />
          {!isMobile && (
            <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
              <RoomAvailabilityWrapper
                rooms={transformedRooms}
                bookings={transformedBookings}
                selectedDate={today}
              />
            </Suspense>
          )}
        </div>

        <POSChargeDialog open={posDialogOpen} onOpenChange={setPosDialogOpen} />
        <SellMembershipDialog open={sellMembershipOpen} onOpenChange={setSellMembershipOpen} />

        <BookingDetailsDialog
          booking={selectedBooking}
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          practitioners={transformedPractitioners}
          rooms={transformedRooms}
          services={transformedServices}
          onBookingDelete={() => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
            queryClient.invalidateQueries({ queryKey: ['bookings'] });
            queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
          }}
        />
      </div>
    </MainLayout>
  );
}

// Wrapper that fetches busy times only when rendered (desktop only)
// Defers busy-times fetch until after paint to avoid blocking initial render
function RoomAvailabilityWrapper({ rooms, bookings, selectedDate }: {
  rooms: { id: string; name: string; description: string; capacity: number; amenities: string[]; color: string; isActive: boolean }[];
  bookings: { id: string; clientName: string; clientEmail: string; clientPhone: string; practitionerId: string; roomId: string; serviceType: string; date: string; startTime: string; endTime: string; status: 'pending' | 'pending_approval' | 'confirmed' | 'cancelled' | 'completed'; notes?: string; createdAt: string }[];
  selectedDate: string;
}) {
  const [fetchEnabled, setFetchEnabled] = useState(false);
  const stableDate = useMemo(() => new Date(), []);

  useEffect(() => {
    const id = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(() => setFetchEnabled(true), { timeout: 500 })
      : setTimeout(() => setFetchEnabled(true), 100);
    return () => {
      if (typeof id === 'number') clearTimeout(id);
      else (window as any).cancelIdleCallback?.(id);
    };
  }, []);

  const { busyTimes: roomBusyTimes } = useCalendarBusyTimes(stableDate, { enabled: fetchEnabled });
  return (
    <RoomAvailabilityLazy
      rooms={rooms}
      bookings={bookings}
      selectedDate={selectedDate}
      roomBusyTimes={roomBusyTimes}
    />
  );
}

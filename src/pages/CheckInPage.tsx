import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import {
  Search, 
  CheckCircle2, 
  Clock, 
  User, 
  MapPin, 
  Leaf,
  ArrowRight,
  Sparkles,
  FileText,
  AlertCircle,
  Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AIConciergeChat } from '@/components/concierge/AIConciergeChat';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trackCheckIn } from '@/lib/klaviyo';

interface Appointment {
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
  balance_due: number | null;
  balance_paid: boolean | null;
  deposit_paid: boolean | null;
  total_amount: number | null;
  service: {
    name: string;
    duration: number;
    description: string | null;
  } | null;
  practitioner: {
    name: string;
  } | null;
  room: {
    name: string;
  } | null;
}

interface BusinessInfo {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  openingTime: string | null;
  closingTime: string | null;
  cancellationPolicyHours: number | null;
}

const PRE_APPOINTMENT_TIPS = [
  {
    icon: Clock,
    title: "Arrive 10-15 minutes early",
    description: "This gives you time to relax and complete any paperwork."
  },
  {
    icon: FileText,
    title: "Complete intake forms",
    description: "If this is your first visit, you may need to fill out health history forms."
  },
  {
    icon: User,
    title: "Communicate your needs",
    description: "Let your therapist know about any areas of concern or pressure preferences."
  },
  {
    icon: AlertCircle,
    title: "Stay hydrated",
    description: "Drink plenty of water before and after your massage for best results."
  }
];

export default function CheckInPage() {
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const [isAutoChecking, setIsAutoChecking] = useState(false);

  const fetchBookingById = async (bookingId: string) => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id,
        client_name,
        client_email,
        client_phone,
        booking_date,
        start_time,
        end_time,
        status,
        notes,
        practitioner_id,
        balance_due,
        balance_paid,
        deposit_paid,
        total_amount,
        service:services(name, duration, description),
        practitioner:practitioners(name),
        room:rooms(name)
      `)
      .eq('id', bookingId)
      .single();
    return data as unknown as Appointment | null;
  };

  // Handle direct check-in link (?id=BOOKING_ID)
  useEffect(() => {
    const directBookingId = searchParams.get('id');

    if (directBookingId) {
      const autoCheckIn = async () => {
        setIsAutoChecking(true);
        try {
          const data = await fetchBookingById(directBookingId);
          if (!data) {
            toast.error('Appointment not found', { description: 'This check-in link may have expired or is invalid.' });
            setIsAutoChecking(false);
            return;
          }

          // If already checked in, just show status
          if (data.status === 'checked-in') {
            setAppointment(data);
            setIsCheckedIn(true);
            setIsAutoChecking(false);
            return;
          }

          setAppointment(data);

          // Complete check-in — staff will process payment manually after the appointment
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'checked-in' })
            .eq('id', directBookingId);

          if (error) throw error;

          // Notify staff
          try {
            await supabase.functions.invoke('notify-checkin', {
              body: {
                bookingId: directBookingId,
                clientName: data.client_name,
                serviceName: data.service?.name || 'Massage',
                startTime: data.start_time,
                practitionerId: data.practitioner_id,
              }
            });
          } catch (e) {
            console.error('Notification error:', e);
          }

          setIsCheckedIn(true);
          setAppointment(prev => prev ? { ...prev, status: 'checked-in' } : null);
          toast.success('Check-in complete!', {
            description: 'Your therapist has been notified of your arrival.'
          });
        } catch (error) {
          console.error('Auto check-in error:', error);
          toast.error('Unable to complete check-in', {
            description: error instanceof Error ? error.message : 'Please try again or ask for assistance.'
          });
        } finally {
          setIsAutoChecking(false);
        }
      };
      autoCheckIn();
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchBusinessInfo = async () => {
      const { data } = await supabase
        .from('business_settings')
        .select('*')
        .single();
      
      if (data) {
        setBusinessInfo({
          name: data.business_name,
          phone: data.phone,
          email: data.email,
          address: data.address,
          openingTime: data.opening_time,
          closingTime: data.closing_time,
          cancellationPolicyHours: data.cancellation_policy_hours,
        });
      }
    };
    fetchBusinessInfo();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Search by email or phone for today's appointments
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          client_name,
          client_email,
          client_phone,
          booking_date,
          start_time,
          end_time,
          status,
          notes,
          practitioner_id,
          balance_due,
          balance_paid,
          deposit_paid,
          total_amount,
          service:services(name, duration, description),
          practitioner:practitioners(name),
          room:rooms(name)
        `)
        .or(`client_email.ilike.%${searchQuery}%,client_phone.ilike.%${searchQuery}%`)
        .gte('booking_date', today)
        .order('booking_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const apt = data[0] as unknown as Appointment;
        setAppointment(apt);
        setIsCheckedIn(apt.status === 'checked-in');
      } else {
        toast.error('No upcoming appointments found', {
          description: 'Please check your email or phone number and try again.'
        });
        setAppointment(null);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Unable to search for appointments');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCheckIn = async () => {
    if (!appointment) return;

    try {
      setIsCheckingIn(true);

      // Complete the check-in — staff will process payment manually after the appointment
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'checked-in' })
        .eq('id', appointment.id);

      if (error) throw error;

      // Send notification to staff
      try {
        await supabase.functions.invoke('notify-checkin', {
          body: {
            bookingId: appointment.id,
            clientName: appointment.client_name,
            serviceName: appointment.service?.name || 'Massage',
            startTime: appointment.start_time,
            practitionerId: appointment.practitioner_id,
          }
        });
      } catch (smsError) {
        console.error('Failed to send notifications:', smsError);
      }

      setIsCheckedIn(true);
      setAppointment(prev => prev ? { ...prev, status: 'checked-in' } : null);

      // Track check-in in Klaviyo
      trackCheckIn({
        bookingId: appointment.id,
        clientName: appointment.client_name,
        clientEmail: appointment.client_email,
        clientPhone: appointment.client_phone,
        serviceName: appointment.service?.name || 'Appointment',
        bookingDate: appointment.booking_date,
        startTime: appointment.start_time,
        practitionerName: appointment.practitioner?.name,
      });

      toast.success('Check-in complete!', {
        description: 'Your therapist has been notified of your arrival.'
      });
    } catch (error) {
      console.error('Check-in error:', error);
      toast.error('Unable to complete check-in', {
        description: error instanceof Error ? error.message : 'Please try again or ask for assistance.'
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  const formatAppointmentDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE, MMMM d');
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const conciergeContext = appointment ? {
    appointment: {
      clientName: appointment.client_name,
      service: appointment.service?.name || 'Massage',
      date: formatAppointmentDate(appointment.booking_date),
      time: formatTime(appointment.start_time),
      practitioner: appointment.practitioner?.name || 'Your therapist',
    },
    businessInfo: businessInfo ? {
      name: businessInfo.name,
      phone: businessInfo.phone || '',
      email: businessInfo.email || '',
      address: businessInfo.address || '',
      openingTime: businessInfo.openingTime || '',
      closingTime: businessInfo.closingTime || '',
      cancellationPolicyHours: businessInfo.cancellationPolicyHours || 24,
    } : undefined,
  } : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet>
        <title>Check In - Custom Booking Massage Studio</title>
        <meta name="description" content="Check in for your massage appointment at Custom Booking Massage Studio" />
      </Helmet>

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-sage flex items-center justify-center">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-lg font-semibold text-foreground">Custom Booking</h1>
                <p className="text-xs text-muted-foreground">Check-In</p>
              </div>
            </Link>
            
            {businessInfo?.phone && (
              <a 
                href={`tel:${businessInfo.phone}`}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span className="hidden sm:inline">{businessInfo.phone}</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {isAutoChecking ? (
          /* Auto check-in loading state */
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground">Checking you in...</h2>
            <p className="text-muted-foreground">Processing your check-in. Please wait.</p>
          </div>
        ) : !appointment ? (
          /* Search View */
          <div className="space-y-8">
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-bold text-foreground mb-3">
                Welcome! Ready to check in?
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Enter your email or phone number to find your appointment and complete your check-in.
              </p>
            </div>

            <Card className="max-w-md mx-auto">
              <CardContent className="pt-6">
                <form onSubmit={handleSearch} className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Email or phone number"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-11 h-12 text-base"
                      autoFocus
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-sage hover:bg-sage-dark"
                    disabled={isSearching || !searchQuery.trim()}
                  >
                    {isSearching ? 'Searching...' : 'Find My Appointment'}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Pre-appointment tips */}
            <div className="mt-12">
              <h3 className="text-lg font-medium text-center text-foreground mb-6">
                First time? Here's what to expect
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {PRE_APPOINTMENT_TIPS.map((tip, index) => (
                  <Card key={index} className="bg-card/50">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <tip.icon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm text-foreground">{tip.title}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{tip.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Appointment Found View */
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Appointment Details */}
            <div className="space-y-6">
              {/* Status Banner */}
              {isCheckedIn ? (
                <div className="bg-sage/10 border border-sage/30 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sage flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-sage-dark">You're checked in!</p>
                    <p className="text-sm text-muted-foreground">Please have a seat. Your therapist will be with you shortly.</p>
                  </div>
                </div>
              ) : (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="pt-6 pb-6">
                    <div className="text-center">
                      <h3 className="font-medium text-foreground mb-2">Ready for your appointment?</h3>
                      
                      {/* Show balance due if applicable */}
                      {appointment.balance_due && appointment.balance_due > 0 && !appointment.balance_paid ? (
                        <div className="mb-4">
                          <p className="text-sm text-muted-foreground mb-2">
                            Please complete your payment to check in.
                          </p>
                          <div className="bg-muted/50 rounded-lg p-3 inline-block">
                            <p className="text-sm text-muted-foreground">Balance Due</p>
                            <p className="text-xl font-semibold text-foreground">${appointment.balance_due.toFixed(2)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground mb-4">
                          Tap the button below to let us know you've arrived.
                        </p>
                      )}
                      
                      <Button 
                        onClick={handleCheckIn}
                        size="lg"
                        className="bg-sage hover:bg-sage-dark w-full sm:w-auto"
                        disabled={isCheckingIn}
                      >
                        {isCheckingIn ? (
                          <>Checking In...</>
                        ) : (
                          <>
                            <CheckCircle2 className="w-5 h-5 mr-2" />
                            Check In Now
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Appointment Card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Your Appointment</CardTitle>
                    <Badge variant={isCheckedIn ? 'default' : 'secondary'} className={cn(isCheckedIn && 'bg-sage')}>
                      {isCheckedIn ? 'Checked In' : 'Confirmed'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {formatAppointmentDate(appointment.booking_date)}
                      </p>
                      <p className="text-muted-foreground">
                        {formatTime(appointment.start_time)} - {formatTime(appointment.end_time)}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Service</p>
                      <p className="font-medium">{appointment.service?.name || 'Massage Session'}</p>
                      {appointment.service?.duration && (
                        <p className="text-sm text-muted-foreground">{appointment.service.duration} minutes</p>
                      )}
                    </div>

                    {appointment.practitioner && (
                      <div>
                        <p className="text-sm text-muted-foreground">Therapist</p>
                        <p className="font-medium">{appointment.practitioner.name}</p>
                      </div>
                    )}

                    {appointment.room && (
                      <div>
                        <p className="text-sm text-muted-foreground">Room</p>
                        <p className="font-medium">{appointment.room.name}</p>
                      </div>
                    )}
                  </div>

                  {businessInfo?.address && (
                    <>
                      <Separator />
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-muted-foreground">{businessInfo.address}</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowChat(!showChat)}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {showChat ? 'Hide Assistant' : 'Ask Alani'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAppointment(null);
                    setSearchQuery('');
                    setIsCheckedIn(false);
                  }}
                >
                  Search Again
                </Button>
              </div>
            </div>

            {/* AI Concierge Chat */}
            <div className={cn(
              "lg:block",
              showChat ? "block" : "hidden"
            )}>
              <div className="sticky top-24">
                <AIConciergeChat 
                  context={conciergeContext}
                  className="h-[500px]"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card/50 mt-auto">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              <Link to="/book" className="hover:text-foreground transition-colors">
                Book Online
              </Link>
              <Link to="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
            </div>
            <p>© {new Date().getFullYear()} Custom Booking Massage Studio</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

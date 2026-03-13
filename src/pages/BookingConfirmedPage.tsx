import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, Calendar, Clock, DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { trackBookingSubmitted } from '@/lib/klaviyo';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';

interface BookingDetails {
  id: string;
  client_name: string;
  client_email: string;
  booking_date: string;
  start_time: string;
  total_amount: number | null;
  balance_due: number | null;
  deposit_paid: boolean;
  services?: { name: string } | null;
}

export default function BookingConfirmedPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking');
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBooking = async () => {
      if (!bookingId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('bookings')
          .select('*, services(name)')
          .eq('id', bookingId)
          .single();

        if (error) throw error;

        setBooking(data);

        // Track in Klaviyo for SMS flow triggers
        if (data) {
          trackBookingSubmitted({
            bookingId: data.id,
            clientName: data.client_name,
            clientEmail: data.client_email,
            serviceName: data.services?.name || 'Appointment',
            bookingDate: data.booking_date,
            startTime: data.start_time,
            totalAmount: data.total_amount,
            balanceDue: data.balance_due,
          });
        }
      } catch (error) {
        console.error('Error fetching booking:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet>
        <title>Booking Confirmed - Custom Booking</title>
      </Helmet>
      
      <div className="container max-w-2xl mx-auto px-4 py-16">
        <div className="bg-card rounded-2xl shadow-medium p-8 text-center">
          <div className="w-16 h-16 bg-sage/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-sage" />
          </div>
          
          <h1 className="text-3xl font-display font-bold text-foreground mb-4">
            Booking Submitted!
          </h1>
          
          <p className="text-muted-foreground mb-8">
            Your booking has been submitted for approval. Please wait for a confirmation email 
            when your practitioner approves the appointment time. You will not be charged for 
            the deposit until your booking is confirmed.
          </p>
          
          {booking && (
            <div className="bg-muted/50 rounded-lg p-6 text-left mb-8 space-y-4">
              <h2 className="font-semibold text-center mb-4">Booking Details</h2>
              
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-sage" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(parseLocalDate(booking.booking_date), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-sage" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-medium">{formatTime(booking.start_time)}</p>
                </div>
              </div>
              
              {booking.services?.name && (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-sage/20 flex items-center justify-center">
                    <span className="text-xs text-sage">✓</span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Service</p>
                    <p className="font-medium">{booking.services.name}</p>
                  </div>
                </div>
              )}
              
              {booking.balance_due && booking.balance_due > 0 && (
                <div className="flex items-center gap-3 pt-2 border-t">
                  <DollarSign className="w-5 h-5 text-terracotta" />
                  <div>
                    <p className="text-sm text-muted-foreground">Balance Due at Appointment</p>
                    <p className="font-semibold text-terracotta">
                      ${booking.balance_due.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/book-online">
              <Button variant="outline">Book Another Session</Button>
            </Link>
            <Link to="/">
              <Button className="bg-sage hover:bg-sage-dark text-white">
                Return Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

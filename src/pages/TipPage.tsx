import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { Leaf, DollarSign, Heart, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { safeRedirect } from '@/lib/safeRedirect';
import { cn } from '@/lib/utils';

interface BookingInfo {
  id: string;
  client_name: string;
  client_email: string;
  service_name: string | null;
  practitioner_name: string | null;
  booking_date: string;
  start_time: string;
  total_amount: number | null;
}

export default function TipPage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking');
  const paid = searchParams.get('paid');

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [customTip, setCustomTip] = useState('');

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    const fetchBooking = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, client_name, client_email, booking_date, start_time, total_amount,
          service:services(name),
          practitioner:practitioners(name)
        `)
        .eq('id', bookingId)
        .single();

      if (error || !data) {
        toast.error('Appointment not found');
        setLoading(false);
        return;
      }

      setBooking({
        id: data.id,
        client_name: data.client_name,
        client_email: data.client_email,
        service_name: (data.service as any)?.name || null,
        practitioner_name: (data.practitioner as any)?.name || null,
        booking_date: data.booking_date,
        start_time: data.start_time,
        total_amount: data.total_amount,
      });
      setLoading(false);
    };

    fetchBooking();
  }, [bookingId]);

  const tipAmount = parseFloat(customTip) || 0;

  const handleSubmitTip = async () => {
    if (!booking || tipAmount <= 0) {
      toast.error('Please enter a tip amount');
      return;
    }
    if (tipAmount > 1000) {
      toast.error('Tip amount cannot exceed $1,000');
      return;
    }
    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-tip-payment', {
        body: {
          bookingId: booking.id,
          tipAmount,
          clientEmail: booking.client_email,
          clientName: booking.client_name,
          practitionerName: booking.practitioner_name || 'Therapist',
          serviceName: booking.service_name || 'Massage',
          bookingDate: booking.booking_date,
        },
      });

      if (error) throw error;
      if (data?.url) {
        safeRedirect(data.url);
      }
    } catch (err) {
      console.error('Tip payment error:', err);
      toast.error('Unable to process tip. Please try again.');
      setProcessing(false);
    }
  };

  const suggestedAmounts = booking?.total_amount
    ? [
        { label: '15%', amount: Math.round(booking.total_amount * 0.15 * 100) / 100 },
        { label: '20%', amount: Math.round(booking.total_amount * 0.20 * 100) / 100 },
        { label: '25%', amount: Math.round(booking.total_amount * 0.25 * 100) / 100 },
        { label: '30%', amount: Math.round(booking.total_amount * 0.30 * 100) / 100 },
      ]
    : [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-cream to-background">
        <Loader2 className="w-8 h-8 animate-spin text-sage" />
      </div>
    );
  }

  if (paid === 'true') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet><title>Thank You - Custom Booking</title></Helmet>
        <header className="border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-sage flex items-center justify-center">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="font-display text-lg font-semibold text-foreground">Custom Booking</h1>
            </Link>
          </div>
        </header>
        <main className="container mx-auto px-4 py-16 max-w-md text-center">
          <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-6">
            <Heart className="w-10 h-10 text-sage" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Thank You for Your Generosity!</h2>
          <p className="text-muted-foreground">
            Your tip has been received and will go directly to {booking?.practitioner_name || 'your therapist'}. We truly appreciate your kindness!
          </p>
        </main>
      </div>
    );
  }

  if (!booking || !bookingId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background flex items-center justify-center">
        <p className="text-muted-foreground">No appointment found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet>
        <title>Leave a Tip - Custom Booking</title>
        <meta name="description" content="Leave a tip for your therapist at Custom Booking Massage Studio" />
      </Helmet>

      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-sage flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">Custom Booking</h1>
              <p className="text-xs text-muted-foreground">Leave a Tip</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md space-y-6">
        {/* Greeting */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-terracotta/10 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-terracotta" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">
            Thank you, {booking.client_name.split(' ')[0]}!
          </h2>
          <p className="text-muted-foreground">
            We hope you enjoyed your {booking.service_name || 'session'}
            {booking.practitioner_name ? ` with ${booking.practitioner_name}` : ''}.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Would you like to leave a tip?
          </p>
        </div>

        {/* Tip Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h3 className="font-semibold text-foreground text-center">
              Tip for {booking.practitioner_name || 'Your Therapist'}
            </h3>

            {/* Suggested amounts */}
            {suggestedAmounts.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {suggestedAmounts.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setCustomTip(opt.amount.toFixed(2))}
                    className={cn(
                      "flex flex-col items-center py-3 px-2 rounded-lg border transition-all text-sm",
                      parseFloat(customTip) === opt.amount
                        ? "border-sage bg-sage/10 text-sage-dark ring-1 ring-sage"
                        : "border-border hover:border-sage/50 text-foreground"
                    )}
                  >
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">${opt.amount.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Custom amount input */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">
                {suggestedAmounts.length > 0 ? 'Or enter a custom amount' : 'Enter tip amount'}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  step="0.01"
                  placeholder="0.00"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  className="pl-8 text-lg h-12"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button
          onClick={handleSubmitTip}
          disabled={processing || tipAmount <= 0}
          className="w-full h-14 text-lg bg-sage hover:bg-sage-dark"
        >
          {processing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Heart className="w-5 h-5 mr-2" />
          )}
          {tipAmount > 0 ? `Send $${tipAmount.toFixed(2)} Tip` : 'Enter an amount'}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Secure payment powered by Stripe. 100% of your tip goes to your therapist.
        </p>
      </main>
    </div>
  );
}
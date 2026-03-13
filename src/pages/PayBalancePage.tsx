import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { Leaf, DollarSign, Heart, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { safeRedirect } from '@/lib/safeRedirect';
import { cn } from '@/lib/utils';

const TIP_OPTIONS = [
  { label: '15%', multiplier: 0.15 },
  { label: '20%', multiplier: 0.20 },
  { label: '25%', multiplier: 0.25 },
  { label: '30%', multiplier: 0.30 },
];

interface BookingInfo {
  id: string;
  client_name: string;
  client_email: string;
  balance_due: number;
  balance_paid: boolean;
  service_name: string | null;
  practitioner_name: string | null;
  booking_date: string;
  start_time: string;
}

export default function PayBalancePage() {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking');
  const paid = searchParams.get('paid');

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    const fetchBooking = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, client_name, client_email, balance_due, balance_paid, booking_date, start_time,
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
        balance_due: data.balance_due || 0,
        balance_paid: data.balance_paid || false,
        service_name: (data.service as any)?.name || null,
        practitioner_name: (data.practitioner as any)?.name || null,
        booking_date: data.booking_date,
        start_time: data.start_time,
      });
      setLoading(false);
    };

    fetchBooking();
  }, [bookingId]);

  // Payment status is handled server-side by the Stripe webhook

  const balanceAmount = booking?.balance_due || 0;
  const tipAmount = isCustom
    ? parseFloat(customTip) || 0
    : selectedTip !== null
      ? Math.round(balanceAmount * TIP_OPTIONS[selectedTip].multiplier * 100) / 100
      : 0;
  const totalAmount = Math.round((balanceAmount + tipAmount) * 100) / 100;

  const handlePayNow = async () => {
    if (!booking) return;
    setProcessing(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-payment-link', {
        body: {
          bookingId: booking.id,
          amount: totalAmount,
          clientEmail: booking.client_email,
          clientName: booking.client_name,
          serviceName: booking.service_name || 'Appointment',
          bookingDate: booking.booking_date,
          startTime: booking.start_time,
          tipAmount,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.url) {
        safeRedirect(data.url);
      }
    } catch (err) {
      console.error('Payment error:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to process payment. Please try again.');
      setProcessing(false);
    }
  };

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
        <Helmet>
          <title>Payment Complete - Custom Booking</title>
        </Helmet>
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
            <CheckCircle2 className="w-10 h-10 text-sage" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">Thank You!</h2>
          <p className="text-muted-foreground">Your payment has been received. We hope you enjoyed your session and look forward to seeing you again!</p>
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

  if (booking.balance_paid || booking.balance_due <= 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet><title>Payment - Custom Booking</title></Helmet>
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
            <CheckCircle2 className="w-10 h-10 text-sage" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-3">All Paid Up!</h2>
          <p className="text-muted-foreground">Your balance has already been settled. Thank you!</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet>
        <title>Complete Payment - Custom Booking</title>
        <meta name="description" content="Complete your appointment payment at Custom Booking" />
      </Helmet>

      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-sage flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">Custom Booking</h1>
              <p className="text-xs text-muted-foreground">Complete Payment</p>
            </div>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md space-y-6">
        {/* Greeting */}
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">
            Thank you, {booking.client_name.split(' ')[0]}!
          </h2>
          <p className="text-muted-foreground">
            We hope you enjoyed your {booking.service_name || 'session'}
            {booking.practitioner_name ? ` with ${booking.practitioner_name}` : ''}.
          </p>
        </div>

        {/* Balance Summary */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Service Balance</span>
              <span className="font-semibold text-foreground">${balanceAmount.toFixed(2)}</span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between items-center text-sage">
                <span>Tip</span>
                <span className="font-semibold">${tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-border pt-3 flex justify-between items-center">
              <span className="font-semibold text-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">${totalAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tip Section */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <Heart className="w-5 h-5 text-terracotta" />
              <h3 className="font-semibold">Add a tip</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Your generosity is greatly appreciated by your therapist!
            </p>

            {/* Preset Tips */}
            <div className="grid grid-cols-4 gap-2">
              {TIP_OPTIONS.map((opt, i) => {
                const amt = Math.round(balanceAmount * opt.multiplier * 100) / 100;
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedTip(i); setIsCustom(false); setCustomTip(''); }}
                    className={cn(
                      "flex flex-col items-center py-3 px-2 rounded-lg border transition-all text-sm",
                      selectedTip === i && !isCustom
                        ? "border-sage bg-sage/10 text-sage-dark ring-1 ring-sage"
                        : "border-border hover:border-sage/50 text-foreground"
                    )}
                  >
                    <span className="font-semibold">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">${amt.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Tip */}
            <div className="flex gap-2 items-center">
              <button
                onClick={() => { setIsCustom(true); setSelectedTip(null); }}
                className={cn(
                  "px-4 py-2 rounded-lg border text-sm transition-all whitespace-nowrap",
                  isCustom
                    ? "border-sage bg-sage/10 text-sage-dark ring-1 ring-sage"
                    : "border-border hover:border-sage/50 text-foreground"
                )}
              >
                Custom
              </button>
              {isCustom && (
                <div className="flex-1 relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={customTip}
                    onChange={(e) => setCustomTip(e.target.value)}
                    className="pl-8"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* No Tip */}
            <button
              onClick={() => { setSelectedTip(null); setIsCustom(false); setCustomTip(''); }}
              className={cn(
                "w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors",
                selectedTip === null && !isCustom && "font-medium text-foreground"
              )}
            >
              No tip
            </button>
          </CardContent>
        </Card>

        {/* Pay Button */}
        <Button
          onClick={handlePayNow}
          disabled={processing}
          className="w-full h-14 text-lg bg-sage hover:bg-sage-dark"
        >
          {processing ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <DollarSign className="w-5 h-5 mr-2" />
          )}
          Pay ${totalAmount.toFixed(2)}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Secure payment powered by Stripe. Your card details are never stored on our servers.
        </p>
      </main>
    </div>
  );
}
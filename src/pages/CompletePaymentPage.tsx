import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DollarSign, Heart, Loader2, CheckCircle2, ArrowLeft, User, Sparkles, Calendar, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const TIP_OPTIONS = [
  { label: '15%', multiplier: 0.15 },
  { label: '20%', multiplier: 0.20 },
  { label: '25%', multiplier: 0.25 },
  { label: '30%', multiplier: 0.30 },
];

// Hawaii General Excise Tax — Hawaii County (Big Island) passable rate
const HAWAII_GET_RATE = 0.0425;

interface BookingInfo {
  id: string;
  client_name: string;
  client_email: string;
  balance_due: number;
  balance_paid: boolean;
  total_amount: number;
  service_name: string | null;
  practitioner_name: string | null;
  booking_date: string;
  start_time: string;
}

export default function CompletePaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const bookingId = searchParams.get('booking');
  const paid = searchParams.get('paid');

  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [charged, setCharged] = useState(false);
  const [paymentLinkSent, setPaymentLinkSent] = useState(false);
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setLoading(false);
      return;
    }

    supabase
      .from('bookings')
      .select('id, client_name, client_email, balance_due, balance_paid, total_amount, booking_date, start_time, service_id, practitioner_id')
      .eq('id', bookingId)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) {
          toast.error('Appointment not found: ' + (error?.message || 'No data'));
          setLoading(false);
          return;
        }

        // Look up service name and practitioner name separately to avoid join ambiguity
        let serviceName: string | null = null;
        let practitionerName: string | null = null;

        if (data.service_id) {
          const { data: svc } = await supabase.from('services').select('name').eq('id', data.service_id).single();
          serviceName = svc?.name || null;
        }
        if (data.practitioner_id) {
          const { data: pract } = await supabase.from('practitioners').select('name').eq('id', data.practitioner_id).single();
          practitionerName = pract?.name || null;
        }

        setBooking({
          id: data.id,
          client_name: data.client_name,
          client_email: data.client_email,
          balance_due: data.balance_due || 0,
          balance_paid: data.balance_paid || false,
          total_amount: data.total_amount || data.balance_due || 0,
          service_name: serviceName,
          practitioner_name: practitionerName,
          booking_date: data.booking_date,
          start_time: data.start_time,
        });
        setLoading(false);
      });
  }, [bookingId]);

  // Return from Stripe Checkout fallback
  useEffect(() => {
    if (paid === 'true') setCharged(true);
  }, [paid]);

  const balanceAmount = booking?.balance_due || 0;
  // Tip and tax are calculated on total service cost (including deposit already paid)
  const tipBase = booking?.total_amount || balanceAmount;
  const tipAmount = isCustom
    ? parseFloat(customTip) || 0
    : selectedTip !== null
      ? Math.round(tipBase * TIP_OPTIONS[selectedTip].multiplier * 100) / 100
      : 0;
  // Hawaii GET charged on full service cost, collected at final payment
  const taxAmount = Math.round(tipBase * HAWAII_GET_RATE * 100) / 100;
  const totalAmount = Math.round((balanceAmount + taxAmount + tipAmount) * 100) / 100;

  const handleProcessPayment = async () => {
    if (!booking) return;
    setProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('charge-balance', {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: {
          bookingId: booking.id,
          tipAmount: tipAmount > 0 ? tipAmount : undefined,
          taxAmount,
        },
      });

      if (error) {
        const message = await getFunctionErrorMessage(error);
        throw new Error(message);
      }

      if (data?.paymentLinkSent) {
        // Card couldn't be charged — payment link was emailed to customer
        toast.success(data?.message || `Payment link sent to ${booking.client_email}`);
        setPaymentLinkSent(true);
        return;
      }

      if (data?.success) {
        setCharged(true);
        return;
      }

      throw new Error(data?.message || 'Unexpected response from payment service');
    } catch (err) {
      console.error('Payment error:', err);
      const message = err instanceof Error ? err.message : 'Unable to process payment. Please try again.';
      toast.error(message);
      setProcessing(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-cream to-background">
        <Loader2 className="w-8 h-8 animate-spin text-sage" />
      </div>
    );
  }

  // Payment link sent — card couldn't be charged, link emailed to customer
  if (paymentLinkSent) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet><title>Payment Link Sent - Custom Booking</title></Helmet>
        <div className="container mx-auto px-4 py-20 max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-sage" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">Payment Link Sent</h2>
            <p className="text-muted-foreground">
              We couldn't charge the saved card. A payment link with the full total (including tip) was sent to{' '}
              <strong>{booking?.client_email}</strong>. The customer can complete payment at their convenience.
            </p>
          </div>
          <Button onClick={() => navigate('/calendar')} className="bg-sage hover:bg-sage-dark gap-2 w-full">
            <ArrowLeft className="w-4 h-4" />
            Back to Calendar
          </Button>
        </div>
      </div>
    );
  }

  // Success state — shown after off-session charge or Stripe Checkout return
  if (charged) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet><title>Payment Complete - Custom Booking</title></Helmet>
        <div className="container mx-auto px-4 py-20 max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-sage" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">Payment Complete</h2>
            <p className="text-muted-foreground">
              {booking?.client_name
                ? `${booking.client_name.split(' ')[0]}'s card has been charged successfully.`
                : 'Payment processed successfully.'}
            </p>
            {tipAmount > 0 && !paid && (
              <p className="text-sm text-sage mt-2">
                Includes ${tipAmount.toFixed(2)} tip for {booking?.practitioner_name || 'the therapist'}.
              </p>
            )}
          </div>
          <Button onClick={() => navigate('/calendar')} className="bg-sage hover:bg-sage-dark gap-2 w-full">
            <ArrowLeft className="w-4 h-4" />
            Back to Calendar
          </Button>
        </div>
      </div>
    );
  }

  if (!booking || !bookingId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background flex flex-col items-center justify-center gap-4">
        <AlertCircle className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground">No appointment found.</p>
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Go Back
        </Button>
      </div>
    );
  }

  if (booking.balance_paid) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-cream to-background">
        <Helmet><title>Payment - Custom Booking</title></Helmet>
        <div className="container mx-auto px-4 py-20 max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-sage" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">Already Settled</h2>
            <p className="text-muted-foreground">This appointment's balance has already been paid.</p>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)} className="gap-2 w-full">
            <ArrowLeft className="w-4 h-4" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <Helmet><title>Complete Payment - Custom Booking</title></Helmet>

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-1.5 text-muted-foreground"
            disabled={processing}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="h-4 w-px bg-border" />
          <h1 className="font-semibold text-foreground">Complete Payment</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-md space-y-5">

        {/* Appointment Summary */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appointment</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 text-sm">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">{booking.client_name}</span>
              </div>
              {booking.service_name && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">
                    {booking.service_name}
                    {booking.practitioner_name && (
                      <span className="text-muted-foreground"> · {booking.practitioner_name}</span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  {format(new Date(booking.booking_date + 'T12:00:00'), 'MMM d, yyyy')} at {formatTime(booking.start_time)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Summary */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Balance Due</span>
              <span className="font-semibold text-foreground">${balanceAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Hawaii GET (4.25%)</span>
              <span className="font-semibold text-foreground">${taxAmount.toFixed(2)}</span>
            </div>
            {tipAmount > 0 && (
              <div className="flex justify-between items-center text-sm text-sage">
                <span>Tip ({isCustom ? 'Custom' : TIP_OPTIONS[selectedTip!]?.label})</span>
                <span className="font-semibold">${tipAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-border pt-3 flex justify-between items-center">
              <span className="font-semibold text-foreground">Total</span>
              <span className="text-xl font-bold text-foreground">${totalAmount.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Tip Selection */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-terracotta" />
              <h3 className="font-semibold text-foreground">
                Tip for {booking.practitioner_name || 'the therapist'}
              </h3>
            </div>

            <p className="text-xs text-muted-foreground">Based on total service cost: ${tipBase.toFixed(2)}</p>

            {/* Percentage presets */}
            <div className="grid grid-cols-4 gap-2">
              {TIP_OPTIONS.map((opt, i) => {
                const amt = Math.round(tipBase * opt.multiplier * 100) / 100;
                return (
                  <button
                    key={i}
                    onClick={() => { setSelectedTip(i); setIsCustom(false); setCustomTip(''); }}
                    disabled={processing}
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

            {/* Custom amount */}
            <div className="flex gap-2 items-center">
              <button
                onClick={() => { setIsCustom(true); setSelectedTip(null); }}
                disabled={processing}
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
                    disabled={processing}
                  />
                </div>
              )}
            </div>

            {/* No tip */}
            <button
              onClick={() => { setSelectedTip(null); setIsCustom(false); setCustomTip(''); }}
              disabled={processing}
              className={cn(
                "w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors",
                selectedTip === null && !isCustom && "font-medium text-foreground"
              )}
            >
              No tip
            </button>
          </CardContent>
        </Card>

        {/* Charge Button */}
        <Button
          onClick={handleProcessPayment}
          disabled={processing}
          className="w-full h-14 text-lg bg-sage hover:bg-sage-dark"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Charging card...
            </>
          ) : (
            <>
              <DollarSign className="w-5 h-5 mr-2" />
              Charge ${totalAmount.toFixed(2)} to Card on File
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Charges the client's saved card on file via Stripe.
        </p>
      </main>
    </div>
  );
}

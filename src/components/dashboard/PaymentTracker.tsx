import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';
import { DollarSign, ExternalLink, CheckCircle2, Clock, XCircle, TrendingUp, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PaymentTrackerProps {
  /** If provided, only show payments for bookings belonging to this practitioner */
  practitionerId?: string;
}

interface PaymentRecord {
  id: string;
  booking_id: string;
  type: string;
  amount: number;
  status: string;
  stripe_checkout_url: string | null;
  sent_to_email: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
  booking?: {
    client_name: string;
    booking_date: string;
    start_time: string;
    service_id: string | null;
  };
}

const typeLabels: Record<string, string> = {
  deposit: 'Deposit',
  balance: 'Balance',
  tip: 'Tip',
  auto_charge: 'Auto-Charge',
};

const statusConfig: Record<string, { icon: typeof CheckCircle2; className: string; label: string }> = {
  paid: { icon: CheckCircle2, className: 'bg-sage-light text-sage', label: 'Paid' },
  pending: { icon: Clock, className: 'bg-terracotta-light text-terracotta', label: 'Pending' },
  failed: { icon: XCircle, className: 'bg-destructive/10 text-destructive', label: 'Failed' },
  expired: { icon: XCircle, className: 'bg-muted text-muted-foreground', label: 'Expired' },
};

export function PaymentTracker({ practitionerId }: PaymentTrackerProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payment-tracker', practitionerId],
    queryFn: async (): Promise<PaymentRecord[]> => {
      // Fetch payments with their booking info
      const query = supabase
        .from('booking_payments')
        .select('*, booking:bookings!booking_payments_booking_id_fkey(client_name, booking_date, start_time, service_id)')
        .order('created_at', { ascending: false })
        .limit(20);

      const { data, error } = await query;
      if (error) throw error;

      let results = (data || []) as any[];

      // If practitioner filter, we need to cross-reference bookings
      if (practitionerId) {
        const { data: practBookings } = await supabase
          .from('bookings')
          .select('id')
          .eq('practitioner_id', practitionerId);
        
        const bookingIds = new Set((practBookings || []).map(b => b.id));
        results = results.filter(p => bookingIds.has(p.booking_id));
      }

      return results.map(p => ({
        ...p,
        booking: Array.isArray(p.booking) ? p.booking[0] : p.booking,
      }));
    },
  });

  // Calculate summary stats
  const totalCollected = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const totalTips = payments
    .filter(p => p.type === 'tip' && p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const pendingPayments = payments.filter(p => p.status === 'pending');

  const handleDeletePayment = async (paymentId: string) => {
    setDeletingId(paymentId);
    try {
      const { error } = await supabase
        .from('booking_payments')
        .delete()
        .eq('id', paymentId);
      if (error) throw error;
      toast.success('Payment record deleted');
      queryClient.invalidateQueries({ queryKey: ['payment-tracker'] });
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Failed to delete payment record');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl shadow-soft border border-border/50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-48" />
          <div className="h-20 bg-muted rounded" />
          <div className="h-20 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl shadow-soft border border-border/50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-sage" />
        <h3 className="font-display text-lg font-semibold text-card-foreground">
          Charges & Tips
        </h3>
      </div>

      {/* Summary Stats */}
      <div className={cn(
        "grid gap-4 px-4 sm:px-6 py-4 border-b border-border/50",
        isMobile ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-3"
      )}>
        <div className="text-center">
          <p className="text-2xl font-bold text-sage">${totalCollected.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Collected</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-terracotta">${totalTips.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <TrendingUp className="w-3 h-3" /> Tips
          </p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground">{pendingPayments.length}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </div>
      </div>

      {/* Payment List */}
      {payments.length === 0 ? (
        <div className="px-6 py-8 text-center text-muted-foreground text-sm">
          No payment records yet. Charges will appear here as bookings are processed.
        </div>
      ) : (
        <div className="divide-y divide-border/50 max-h-[400px] overflow-y-auto">
          {payments.map((payment) => {
            const config = statusConfig[payment.status] || statusConfig.pending;
            const StatusIcon = config.icon;

            return (
              <div
                key={payment.id}
                className="px-6 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
              >
                {/* Type badge */}
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs capitalize shrink-0',
                    payment.type === 'tip' && 'border-terracotta/50 text-terracotta',
                    payment.type === 'deposit' && 'border-sage/50 text-sage',
                    payment.type === 'balance' && 'border-primary/50 text-primary',
                    payment.type === 'auto_charge' && 'border-primary/50 text-primary'
                  )}
                >
                  {typeLabels[payment.type] || payment.type}
                </Badge>

                {/* Client & booking info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground truncate">
                    {payment.booking?.client_name || 'Unknown Client'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payment.booking?.booking_date
                      ? format(parseLocalDate(payment.booking.booking_date), 'MMM d')
                      : ''}
                    {payment.booking?.start_time
                      ? ` at ${formatTime(payment.booking.start_time)}`
                      : ''}
                  </p>
                </div>

                {/* Amount */}
                <p className={cn(
                  'font-semibold text-sm shrink-0',
                  payment.type === 'tip' ? 'text-terracotta' : 'text-card-foreground'
                )}>
                  ${Number(payment.amount).toFixed(2)}
                </p>

                {/* Status */}
                <Badge className={cn('text-xs shrink-0 gap-1', config.className)}>
                  <StatusIcon className="w-3 h-3" />
                  {config.label}
                </Badge>

                {/* Link out to Stripe if pending */}
                {payment.status === 'pending' && payment.stripe_checkout_url && (
                  <a
                    href={payment.stripe_checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Open payment link"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Delete pending payments */}
                {payment.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeletePayment(payment.id)}
                    disabled={deletingId === payment.id}
                    title="Delete pending payment"
                  >
                    {deletingId === payment.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

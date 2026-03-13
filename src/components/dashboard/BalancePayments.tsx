import { parseLocalDate } from '@/lib/utils';
import { format } from 'date-fns';
import { DollarSign, CreditCard, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface Booking {
  id: string;
  client_name: string;
  client_email: string;
  booking_date: string;
  start_time: string;
  balance_due: number | null;
  total_amount: number | null;
  status: string | null;
  is_insurance_booking: boolean | null;
}

interface BalancePaymentsProps {
  bookings: Booking[];
  onRefresh: () => void;
}

export function BalancePayments({ bookings }: BalancePaymentsProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Show confirmed or checked-in bookings with outstanding balance
  const bookingsWithBalance = bookings.filter(
    b => b.balance_due && b.balance_due > 0
      && (b.status === 'confirmed' || b.status === 'checked-in')
      && !b.is_insurance_booking
  );

  if (bookingsWithBalance.length === 0) {
    return null;
  }

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const displayBookings = bookingsWithBalance.slice(0, 5);
  const hasMore = bookingsWithBalance.length > 5;

  return (
    <div className="bg-card rounded-xl shadow-soft border border-border/50">
      <div className="px-4 sm:px-6 py-4 border-b border-border/50 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-terracotta" />
        <h3 className="font-display text-lg font-semibold text-card-foreground">
          Outstanding Balances
        </h3>
        <span className="ml-auto text-sm text-muted-foreground">
          {bookingsWithBalance.length} pending
        </span>
      </div>
      <div className="divide-y divide-border/50">
        {displayBookings.map((booking) => (
          <div
            key={booking.id}
            className={cn(
              "px-4 sm:px-6 py-4 hover:bg-secondary/30 transition-colors",
              isMobile
                ? "flex flex-col gap-3"
                : "flex items-center justify-between gap-4"
            )}
          >
            <div className={cn("flex-1 min-w-0", isMobile && "order-1")}>
              <p className="font-medium text-card-foreground truncate">
                {booking.client_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(parseLocalDate(booking.booking_date), 'MMM d, yyyy')} at{' '}
                {formatTime(booking.start_time)}
              </p>
            </div>
            <div className={cn(
              "flex items-center gap-3",
              isMobile ? "flex-row justify-between items-center order-2" : "text-right"
            )}>
              <div className={isMobile ? "text-left" : "text-right"}>
                <p className="font-semibold text-terracotta">
                  ${booking.balance_due?.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">balance due</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/complete-payment?booking=${booking.id}`)}
                className={cn(isMobile && "w-full sm:w-auto min-h-[44px]")}
              >
                <CreditCard className="w-4 h-4 mr-1" />
                Complete
              </Button>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="px-4 sm:px-6 py-3 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/bookings')}
          >
            View all {bookingsWithBalance.length} balances
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

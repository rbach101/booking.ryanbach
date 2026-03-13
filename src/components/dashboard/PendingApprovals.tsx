import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseLocalDate } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, X, Clock, User, Phone, Calendar, Loader2, CalendarClock, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { trackBookingApproved, trackBookingCancelled } from '@/lib/klaviyo';
import { usePractitioners } from '@/hooks/usePractitioners';

interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  practitionerId: string;
  practitioner2Id?: string | null;
  roomId: string;
  serviceType: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'pending_approval' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  approvedByPractitioner1?: string | null;
  approvedByPractitioner2?: string | null;
}

interface Practitioner {
  id: string;
  name: string;
  color: string;
}

interface PendingApprovalsProps {
  bookings: Booking[];
  practitioners: Practitioner[];
  onRefresh?: () => void;
}

export function PendingApprovals({ bookings, practitioners, onRefresh }: PendingApprovalsProps) {
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { data: dbPractitioners = [] } = usePractitioners();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [action, setAction] = useState<'approve' | 'decline' | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newPractitionerId, setNewPractitionerId] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [reassignLoading, setReassignLoading] = useState<string | null>(null);
  const { toast } = useToast();

  const DAY_MAP: Record<number, string> = {
    0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
    4: 'thursday', 5: 'friday', 6: 'saturday',
  };

  // Check if a practitioner is available at a specific date/time
  const checkPractitionerAvailability = (practId: string, dateStr: string, startTime: string, endTime: string) => {
    const pract = dbPractitioners.find(p => p.id === practId);
    if (!pract) return false;
    const dayOfWeek = DAY_MAP[new Date(dateStr + 'T12:00:00').getDay()];
    const daySlots = (pract.availability as any)?.[dayOfWeek] || [];
    return daySlots.some((slot: { start: string; end: string }) => {
      return startTime >= slot.start.slice(0, 5) && endTime <= slot.end.slice(0, 5);
    });
  };

  // Filter practitioners to only those with schedule blocks
  const eligiblePractitioners = useMemo(() => {
    return dbPractitioners.filter(p => {
      const hasSchedule = Object.values(p.availability || {}).some(
        (slots: any[]) => slots && slots.length > 0
      );
      return hasSchedule;
    });
  }, [dbPractitioners]);

  // For each eligible practitioner, check availability at the reschedule time
  const practitionerAvailabilityAtBookingTime = useMemo(() => {
    if (!rescheduleBooking || !newDate || !newStartTime) return {};
    const [origSH, origSM] = rescheduleBooking.startTime.split(':').map(Number);
    const [origEH, origEM] = rescheduleBooking.endTime.split(':').map(Number);
    const durationMin = (origEH * 60 + origEM) - (origSH * 60 + origSM);
    const [nSH, nSM] = newStartTime.split(':').map(Number);
    const endTotalMin = nSH * 60 + nSM + durationMin;
    const computedEndTime = `${Math.floor(endTotalMin / 60).toString().padStart(2, '0')}:${(endTotalMin % 60).toString().padStart(2, '0')}`;

    const result: Record<string, boolean> = {};
    eligiblePractitioners.forEach(p => {
      result[p.id] = checkPractitionerAvailability(p.id, newDate, newStartTime, computedEndTime);
    });
    return result;
  }, [eligiblePractitioners, newDate, newStartTime, rescheduleBooking, dbPractitioners]);

  // Generate time options filtered by selected practitioner's schedule
  const filteredTimeOptions = useMemo(() => {
    if (!newDate) return [];
    const dayOfWeek = DAY_MAP[new Date(newDate + 'T12:00:00').getDay()];
    const selectedPract = dbPractitioners.find(p => p.id === (newPractitionerId || rescheduleBooking?.practitionerId));
    if (!selectedPract) return [];
    const daySlots = (selectedPract.availability as any)?.[dayOfWeek] || [];
    if (daySlots.length === 0) return [];

    const options: string[] = [];
    daySlots.forEach((slot: { start: string; end: string }) => {
      const startH = parseInt(slot.start.split(':')[0]);
      const startM = parseInt(slot.start.split(':')[1] || '0');
      const endH = parseInt(slot.end.split(':')[0]);
      const endM = parseInt(slot.end.split(':')[1] || '0');
      const slotStart = startH * 60 + startM;
      const slotEnd = endH * 60 + endM;
      for (let m = slotStart; m < slotEnd; m += 15) {
        const h = Math.floor(m / 60);
        const min = m % 60;
        options.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
      }
    });
    return options.sort();
  }, [newDate, newPractitionerId, rescheduleBooking?.practitionerId, dbPractitioners]);

  const pendingBookings = bookings.filter(b => b.status === 'pending_approval' || b.status === 'pending');

  const getPractitionerName = (practitionerId: string) => {
    const practitioner = practitioners.find(p => p.id === practitionerId);
    return practitioner?.name || 'Unassigned';
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleAction = async () => {
    if (!selectedBooking || !action) return;

    setLoading(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      if (!headers.Authorization) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('approve-booking', {
        headers,
        body: {
          bookingId: selectedBooking.id,
          action,
          reason: reason || undefined,
        },
      });

      if (response.error) {
        const message = await getFunctionErrorMessage(response.error);
        throw new Error(message);
      }

      const result = response.data;

      // Track in Klaviyo — fetch full booking details for the event
      try {
        const { data: fullBooking } = await supabase
          .from('bookings')
          .select('*, services(name)')
          .eq('id', selectedBooking.id)
          .single();

        if (fullBooking) {
          if (action === 'approve') {
            trackBookingApproved({
              bookingId: fullBooking.id,
              clientName: fullBooking.client_name,
              clientEmail: fullBooking.client_email,
              clientPhone: fullBooking.client_phone,
              serviceName: fullBooking.services?.name || selectedBooking.serviceType,
              bookingDate: fullBooking.booking_date,
              startTime: fullBooking.start_time,
              practitionerName: getPractitionerName(selectedBooking.practitionerId),
            });
          } else {
            trackBookingCancelled({
              bookingId: fullBooking.id,
              clientEmail: fullBooking.client_email,
              serviceName: fullBooking.services?.name || selectedBooking.serviceType,
              bookingDate: fullBooking.booking_date,
            });
          }
        }
      } catch (e) {
        console.warn('Klaviyo tracking error (non-blocking):', e);
      }

      if (action === 'approve') {
        if (result?.partialApproval) {
          toast({ title: 'Partial Approval Recorded', description: result.message || `Waiting for ${result.awaitingPractitioner} to also approve.` });
        } else if (result?.depositCharged) {
          toast({ title: 'Booking Approved & Deposit Charged', description: `${selectedBooking.clientName}'s deposit was charged successfully.` });
        } else if (result?.paymentLinkSent) {
          toast({ title: 'Booking Approved — Deposit Link Sent', description: `A deposit payment link was sent to ${selectedBooking.clientName}.` });
          if (result?.paymentLinkUrl) {
            window.open(result.paymentLinkUrl, '_blank');
          }
        } else if (result?.depositError) {
          toast({ title: 'Booking Approved — Deposit Issue', description: result.depositError, variant: 'destructive' });
        } else {
          toast({ title: 'Booking Approved', description: `The appointment for ${selectedBooking.clientName} has been confirmed.` });
        }
      } else {
        toast({ title: 'Booking Declined', description: `The appointment for ${selectedBooking.clientName} has been declined.` });
      }

      setSelectedBooking(null);
      setAction(null);
      setReason('');
      onRefresh?.();
    } catch (error) {
      console.error('Error processing booking:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process request',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const generateTimeOptions = () => {
    const options: string[] = [];
    for (let h = 6; h <= 21; h++) {
      for (let m = 0; m < 60; m += 15) {
        options.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
      }
    }
    return options;
  };

  const handleReschedule = async () => {
    if (!rescheduleBooking || !newDate || !newStartTime) return;

    setRescheduleLoading(true);
    try {
      // Calculate new end time based on original duration
      const [origSH, origSM] = rescheduleBooking.startTime.split(':').map(Number);
      const [origEH, origEM] = rescheduleBooking.endTime.split(':').map(Number);
      const durationMin = (origEH * 60 + origEM) - (origSH * 60 + origSM);
      const [newSH, newSM] = newStartTime.split(':').map(Number);
      const endTotalMin = newSH * 60 + newSM + durationMin;
      const newEndTime = `${Math.floor(endTotalMin / 60).toString().padStart(2, '0')}:${(endTotalMin % 60).toString().padStart(2, '0')}`;

      const updateData: Record<string, string> = {
          booking_date: newDate,
          start_time: newStartTime,
          end_time: newEndTime,
        };
      if (newPractitionerId && newPractitionerId !== rescheduleBooking.practitionerId) {
        updateData.practitioner_id = newPractitionerId;
      }

      // Validate practitioner availability before saving
      const selectedPractId = newPractitionerId || rescheduleBooking.practitionerId;
      const rescheduleDay = new Date(newDate + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
      const { data: availBlocks } = await supabase
        .from('availability_blocks')
        .select('start_time, end_time')
        .eq('practitioner_id', selectedPractId)
        .eq('day_of_week', rescheduleDay)
        .eq('is_available', true);

      const isWithinSchedule = (availBlocks || []).some(block => {
        const blockStart = block.start_time.slice(0, 5);
        const blockEnd = block.end_time.slice(0, 5);
        return newStartTime >= blockStart && newEndTime <= blockEnd;
      });

      if (!isWithinSchedule) {
        const practName = getPractitionerName(selectedPractId);
        toast({
          title: 'Outside Schedule',
          description: `${practName} is not scheduled to work at ${formatTime(newStartTime)} on this day.`,
          variant: 'destructive',
        });
        setRescheduleLoading(false);
        return;
      }

      // Check for overlapping bookings with the selected practitioner
      const { data: conflictBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', newDate)
        .eq('practitioner_id', selectedPractId)
        .neq('status', 'cancelled')
        .neq('id', rescheduleBooking.id)
        .lt('start_time', newEndTime)
        .gt('end_time', newStartTime);

      if (conflictBookings && conflictBookings.length > 0) {
        const practName = getPractitionerName(selectedPractId);
        toast({
          title: 'Booking Conflict',
          description: `${practName} already has a booking during this time.`,
          variant: 'destructive',
        });
        setRescheduleLoading(false);
        return;
      }

      // Check Google Calendar busy times
      try {
        const { data: availData } = await supabase.functions.invoke('public-availability', {
          body: { startDate: newDate, endDate: newDate },
        });
        if (availData?.busyTimes?.[selectedPractId]) {
          const busyTimes = availData.busyTimes[selectedPractId] as { start: string; end: string }[];
          const [slotH, slotM] = newStartTime.split(':').map(Number);
          const slotStartMin = slotH * 60 + slotM;
          const [endH2, endM2] = newEndTime.split(':').map(Number);
          const slotEndMin = endH2 * 60 + endM2;

          const hasCalendarConflict = busyTimes.some(busy => {
            const isAllDay = !busy.start.includes('T');
            if (isAllDay) {
              return newDate >= busy.start && newDate < busy.end;
            }
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            const bsHST = new Date(busyStart.getTime() - 10 * 60 * 60 * 1000);
            const beHST = new Date(busyEnd.getTime() - 10 * 60 * 60 * 1000);
            const bsDate = bsHST.toISOString().split('T')[0];
            if (bsDate !== newDate) return false;
            const bsMin = bsHST.getUTCHours() * 60 + bsHST.getUTCMinutes();
            const beMin = beHST.getUTCHours() * 60 + beHST.getUTCMinutes();
            return slotStartMin < beMin && slotEndMin > bsMin;
          });

          if (hasCalendarConflict) {
            const practName = getPractitionerName(selectedPractId);
            toast({
              title: 'Calendar Conflict',
              description: `${practName} has a Google Calendar conflict during this time.`,
              variant: 'destructive',
            });
            setRescheduleLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Calendar conflict check (non-blocking):', e);
      }

      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', rescheduleBooking.id);

      if (error) throw error;

      // Sync reschedule to Google Calendar
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'delete-event', bookingId: rescheduleBooking.id } }).catch(() => {});
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'create-event', bookingId: rescheduleBooking.id } });
        }
      } catch (e) {
        console.warn('Calendar sync (non-blocking):', e);
      }

      // Notify client of reschedule
      try {
        await supabase.functions.invoke('notify-staff-booking', {
          body: { bookingId: rescheduleBooking.id, reschedule: true },
        });
      } catch (e) {
        console.warn('Reschedule notification (non-blocking):', e);
      }

      toast({
        title: 'Booking Rescheduled',
        description: `${rescheduleBooking.clientName}'s appointment moved to ${format(new Date(newDate), 'MMM d, yyyy')} at ${formatTime(newStartTime)}. Client notified.`,
      });

      setRescheduleBooking(null);
      setNewDate('');
      setNewStartTime('');
      setNewPractitionerId('');
      onRefresh?.();
    } catch (error) {
      console.error('Error rescheduling:', error);
      toast({
        title: 'Error',
        description: 'Failed to reschedule booking',
        variant: 'destructive',
      });
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleReassign = async (booking: Booking) => {
    setReassignLoading(booking.id);
    try {
      // Get the service to check practitioner_ids restrictions
      const { data: service } = await supabase
        .from('services')
        .select('practitioner_ids')
        .eq('name', booking.serviceType)
        .single();

      const allowedIds: string[] | null = service?.practitioner_ids || null;

      // Find next available practitioner (not the current one)
      let nextPract: { id: string; name: string } | null = null;

      for (const p of eligiblePractitioners) {
        if (p.id === booking.practitionerId) continue;
        // Check service authorization
        if (allowedIds && allowedIds.length > 0 && !allowedIds.includes(p.id)) continue;
        // Check schedule availability
        if (!checkPractitionerAvailability(p.id, booking.date, booking.startTime, booking.endTime)) continue;

        // Check internal booking conflicts
        const { data: conflicts } = await supabase
          .from('bookings')
          .select('id')
          .eq('booking_date', booking.date)
          .eq('practitioner_id', p.id)
          .neq('status', 'cancelled')
          .neq('id', booking.id)
          .lt('start_time', booking.endTime)
          .gt('end_time', booking.startTime);

        if (conflicts && conflicts.length > 0) continue;

        // Check Google Calendar conflicts
        try {
          const { data: availData } = await supabase.functions.invoke('public-availability', {
            body: { startDate: booking.date, endDate: booking.date },
          });
          if (availData?.busyTimes?.[p.id]) {
            const busyTimes = availData.busyTimes[p.id] as { start: string; end: string }[];
            const [sH, sM] = booking.startTime.split(':').map(Number);
            const [eH, eM] = booking.endTime.split(':').map(Number);
            const slotStartMin = sH * 60 + sM;
            const slotEndMin = eH * 60 + eM;
            const hasConflict = busyTimes.some(busy => {
              const isAllDay = !busy.start.includes('T');
              if (isAllDay) return booking.date >= busy.start && booking.date < busy.end;
              const busyStart = new Date(busy.start);
              const busyEnd = new Date(busy.end);
              const bsHST = new Date(busyStart.getTime() - 10 * 60 * 60 * 1000);
              const beHST = new Date(busyEnd.getTime() - 10 * 60 * 60 * 1000);
              const bsDate = bsHST.toISOString().split('T')[0];
              if (bsDate !== booking.date) return false;
              const bsMin = bsHST.getUTCHours() * 60 + bsHST.getUTCMinutes();
              const beMin = beHST.getUTCHours() * 60 + beHST.getUTCMinutes();
              return slotStartMin < beMin && slotEndMin > bsMin;
            });
            if (hasConflict) continue;
          }
        } catch (e) {
          console.warn('Calendar check non-blocking:', e);
        }

        nextPract = { id: p.id, name: p.name };
        break;
      }

      if (!nextPract) {
        toast({
          title: 'No Available Practitioner',
          description: `No other practitioner is available for ${formatTime(booking.startTime)} on ${format(parseLocalDate(booking.date), 'MMM d, yyyy')}.`,
          variant: 'destructive',
        });
        return;
      }

      // Reassign the booking
      const { error } = await supabase
        .from('bookings')
        .update({ practitioner_id: nextPract.id })
        .eq('id', booking.id);

      if (error) throw error;

      // Sync practitioner change to Google Calendar (event moves to new practitioner's calendar)
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'delete-event', bookingId: booking.id } }).catch(() => {});
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'create-event', bookingId: booking.id } });
        }
      } catch (e) {
        console.warn('Calendar sync (non-blocking):', e);
      }

      // Send notification to the new practitioner
      try {
        await supabase.functions.invoke('send-notification', {
          body: {
            type: 'booking_reassigned',
            bookingId: booking.id,
            recipientType: 'staff',
          },
        });
      } catch (e) {
        console.warn('Notification send non-blocking:', e);
      }

      toast({
        title: 'Reassigned Successfully',
        description: `${booking.clientName}'s appointment reassigned to ${nextPract.name}.`,
      });

      onRefresh?.();
    } catch (error) {
      console.error('Error reassigning:', error);
      toast({
        title: 'Error',
        description: 'Failed to reassign booking.',
        variant: 'destructive',
      });
    } finally {
      setReassignLoading(null);
    }
  };

  if (pendingBookings.length === 0) {
    return null;
  }

  return (
    <>
      <Card id="pending-approvals" className="border-amber-200 bg-amber-50/50 scroll-mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-lg">Pending Approvals</CardTitle>
            </div>
          </div>
          <CardDescription>
            {pendingBookings.length} booking{pendingBookings.length !== 1 ? 's' : ''} awaiting confirmation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingBookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-background rounded-lg border p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{booking.clientName}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{booking.serviceType}</p>
                </div>
                {booking.practitioner2Id && (booking.approvedByPractitioner1 || booking.approvedByPractitioner2) ? (
                  <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                    1 of 2 Approved
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                    Pending
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {format(parseLocalDate(booking.date), 'MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatTime(booking.startTime)}
                </div>
                {booking.clientPhone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {booking.clientPhone}
                  </div>
                )}
              </div>

              <div className="text-sm">
                <span className="text-muted-foreground">
                  {booking.practitioner2Id ? 'Practitioners: ' : 'Practitioner: '}
                </span>
                <span className="font-medium">
                  {getPractitionerName(booking.practitionerId)}
                  {booking.practitioner2Id && ` & ${getPractitionerName(booking.practitioner2Id)}`}
                </span>
              </div>

              <div className={cn(
                "flex gap-2 pt-2",
                isMobile ? "flex-col sm:flex-row flex-wrap" : ""
              )}>
                <Button
                  size="sm"
                  onClick={() => {
                    setSelectedBooking(booking);
                    setAction('approve');
                  }}
                  className={cn(
                    "flex-1 bg-sage hover:bg-sage-dark",
                    isMobile && "min-h-[44px]"
                  )}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setRescheduleBooking(booking);
                    setNewDate(booking.date);
                    setNewStartTime(booking.startTime);
                    setNewPractitionerId(booking.practitionerId);
                  }}
                  className={cn("flex-1", isMobile && "min-h-[44px]")}
                >
                  <CalendarClock className="w-4 h-4 mr-1" />
                  Reschedule
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReassign(booking)}
                  disabled={reassignLoading === booking.id}
                  className={cn("flex-1", isMobile && "min-h-[44px]")}
                >
                  {reassignLoading === booking.id ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4 mr-1" />
                  )}
                  Reassign
                </Button>
                {isAdmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedBooking(booking);
                      setAction('decline');
                    }}
                    className={cn(
                      "text-destructive border-destructive/50 hover:bg-destructive/10",
                      isMobile && "min-h-[44px]"
                    )}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!selectedBooking && !!action} onOpenChange={() => {
        setSelectedBooking(null);
        setAction(null);
        setReason('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Booking' : 'Decline Booking'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? `Confirm the appointment for ${selectedBooking?.clientName}. They will receive an email notification.`
                : `Decline the appointment for ${selectedBooking?.clientName}. They will receive an email notification.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><strong>Service:</strong> {selectedBooking?.serviceType}</p>
              <p><strong>Date:</strong> {selectedBooking && format(parseLocalDate(selectedBooking.date), 'EEEE, MMMM d, yyyy')}</p>
              <p><strong>Time:</strong> {selectedBooking && formatTime(selectedBooking.startTime)}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {action === 'approve' ? 'Add a note (optional)' : 'Reason for declining (optional)'}
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={action === 'approve' ? 'Any notes for this booking...' : 'Let the client know why...'}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedBooking(null);
                setAction(null);
                setReason('');
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={loading}
              className={action === 'approve' ? 'bg-sage hover:bg-sage-dark' : 'bg-destructive hover:bg-destructive/90'}
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {action === 'approve' ? 'Confirm Approval' : 'Confirm Decline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rescheduleBooking} onOpenChange={() => {
        setRescheduleBooking(null);
        setNewDate('');
        setNewStartTime('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Booking</DialogTitle>
            <DialogDescription>
              Change the date and time for {rescheduleBooking?.clientName}'s appointment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><strong>Service:</strong> {rescheduleBooking?.serviceType}</p>
              <p><strong>Current:</strong> {rescheduleBooking && format(parseLocalDate(rescheduleBooking.date), 'MMM d, yyyy')} at {rescheduleBooking && formatTime(rescheduleBooking.startTime)} – {rescheduleBooking && formatTime(rescheduleBooking.endTime)}</p>
            </div>

            <div className="space-y-2">
              <Label>Practitioner</Label>
              <Select value={newPractitionerId} onValueChange={setNewPractitionerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select practitioner" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePractitioners.map(p => {
                    const isAvailable = practitionerAvailabilityAtBookingTime[p.id];
                    const isCurrent = p.id === rescheduleBooking?.practitionerId;
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <span>{p.name}</span>
                          {isCurrent && <Badge variant="outline" className="text-[10px] px-1 py-0">Current</Badge>}
                          {isAvailable ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1 py-0">Available</Badge>
                          ) : (
                            <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px] px-1 py-0">Unavailable</Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {newPractitionerId && practitionerAvailabilityAtBookingTime[newPractitionerId] === false && (
                <p className="text-xs text-destructive">
                  This practitioner is not scheduled at this time. Choose a different time below.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>New Date</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>

            <div className="space-y-2">
              <Label>New Start Time</Label>
              {filteredTimeOptions.length === 0 && newDate ? (
                <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-destructive/10 text-destructive text-sm">
                  No available times for this practitioner on this date
                </div>
              ) : (
                <Select value={newStartTime} onValueChange={setNewStartTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time">
                      {newStartTime && formatTime(newStartTime)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTimeOptions.map(t => (
                      <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRescheduleBooking(null);
                setNewDate('');
                setNewStartTime('');
                setNewPractitionerId('');
              }}
              disabled={rescheduleLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={rescheduleLoading || !newDate || !newStartTime}
              className="bg-sage hover:bg-sage-dark"
            >
              {rescheduleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

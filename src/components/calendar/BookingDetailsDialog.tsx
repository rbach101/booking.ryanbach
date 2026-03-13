import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { POSChargeDialog } from '@/components/pos/POSChargeDialog';
import { useAuth } from '@/hooks/useAuth';
import { usePractitioners } from '@/hooks/usePractitioners';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Booking, Practitioner, Room, Service } from '@/types/booking';
import { User, Mail, Phone, Clock, Calendar, MapPin, FileText, Sparkles, Trash2, Pencil, Save, RefreshCw, CreditCard, ExternalLink, DollarSign, CalendarClock, Loader2, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface BookingDetailsDialogProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitioners: Practitioner[];
  rooms: Room[];
  services: Service[];
  onBookingDelete?: (bookingId: string) => void;
}

export function BookingDetailsDialog({
  booking,
  open,
  onOpenChange,
  practitioners,
  rooms,
  services,
  onBookingDelete,
}: BookingDetailsDialogProps) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: dbPractitioners = [] } = usePractitioners();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editEndTime, setEditEndTime] = useState('');
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentDeleteDialogOpen, setPaymentDeleteDialogOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<any>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('');
  const [newPractitionerId, setNewPractitionerId] = useState('');
  const [newPractitioner2Id, setNewPractitioner2Id] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [posDialogOpen, setPosDialogOpen] = useState(false);

  // Deduplicate pending deposits: only show the most recent when multiple exist
  const dedupePayments = (raw: { type: string; status: string; created_at: string }[]) => {
    const depositPending = raw.filter((p) => p.type === 'deposit' && p.status === 'pending');
    const others = raw.filter((p) => p.type !== 'deposit' || p.status !== 'pending');
    const keepDeposit = depositPending.length > 1
      ? depositPending.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
      : depositPending[0];
    const deduped = keepDeposit ? [...others, keepDeposit] : others;
    return deduped.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  };

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

  // For each eligible practitioner, check if they're available at the current booking's time
  const practitionerAvailabilityAtBookingTime = useMemo(() => {
    if (!booking || !newDate || !newStartTime) return {};
    const [origSH, origSM] = (booking?.startTime || '00:00').split(':').map(Number);
    const [origEH, origEM] = (booking?.endTime || '00:00').split(':').map(Number);
    const durationMin = (origEH * 60 + origEM) - (origSH * 60 + origSM);
    const [nSH, nSM] = newStartTime.split(':').map(Number);
    const endTotalMin = nSH * 60 + nSM + durationMin;
    const computedEndTime = `${Math.floor(endTotalMin / 60).toString().padStart(2, '0')}:${(endTotalMin % 60).toString().padStart(2, '0')}`;

    const result: Record<string, boolean> = {};
    eligiblePractitioners.forEach(p => {
      result[p.id] = checkPractitionerAvailability(p.id, newDate, newStartTime, computedEndTime);
    });
    return result;
  }, [eligiblePractitioners, newDate, newStartTime, booking, dbPractitioners]);

  // Generate time options filtered by selected practitioner's schedule
  const filteredRescheduleTimeOptions = useMemo(() => {
    if (!newDate) return [];
    const dayOfWeek = DAY_MAP[new Date(newDate + 'T12:00:00').getDay()];
    const selectedPract = dbPractitioners.find(p => p.id === (newPractitionerId || booking?.practitionerId));
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
  }, [newDate, newPractitionerId, booking?.practitionerId, dbPractitioners]);

  const handleSendNotification = async () => {
    if (!booking) return;
    setIsSendingNotification(true);
    try {
      const { error } = await supabase.functions.invoke('notify-staff-booking', {
        body: { bookingId: booking.id, reschedule: true },
      });
      if (error) throw error;
      toast.success(`Appointment notification sent to ${booking.clientName}`);
    } catch (err) {
      console.error('Error sending notification:', err);
      toast.error('Failed to send notification');
    } finally {
      setIsSendingNotification(false);
    }
  };

  useEffect(() => {
    if (!booking || !open) return;
    supabase
      .from('booking_payments')
      .select('*')
      .eq('booking_id', booking.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setPayments(dedupePayments(data || [])));
  }, [booking?.id, open]);

  if (!booking) return null;

  const practitioner = practitioners.find(p => p.id === booking.practitionerId);
  const practitioner2 = booking.practitioner2Id ? practitioners.find(p => p.id === booking.practitioner2Id) : null;
  const room = rooms.find(r => r.id === booking.roomId);
  const service = services.find(s => s.id === booking.serviceType);
  const isCouplesService = !!service?.is_couples || !!booking.practitioner2Id;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    pending_approval: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    confirmed: 'bg-green-100 text-green-800 border-green-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
    completed: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Generate end time options (15-min increments from start time up to 4 hours)
  const endTimeOptions = (() => {
    const [startH, startM] = booking.startTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const options: string[] = [];
    for (let m = startMinutes + 15; m <= Math.min(startMinutes + 240, 23 * 60 + 45); m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      options.push(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    }
    return options;
  })();

  const handleStartEdit = () => {
    setEditEndTime(booking.endTime);
    setIsEditingTime(true);
  };

  const handleSaveTime = async () => {
    if (editEndTime === booking.endTime) {
      setIsEditingTime(false);
      return;
    }
    setIsSavingTime(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ end_time: editEndTime })
        .eq('id', booking.id);

      if (error) throw error;
      debugLog('BookingDetailsDialog.tsx:bookings.update', 'Booking end time updated', { booking_id: booking.id, end_time: editEndTime });

      // Sync duration change to Google Calendar (delete old event if any, create with new end time)
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'delete-event', bookingId: booking.id } }).catch(() => {});
          await supabase.functions.invoke('google-calendar-sync', { headers, body: { action: 'create-event', bookingId: booking.id } });
        }
      } catch (e) {
        console.error('Calendar sync (non-blocking):', e);
      }

      toast.success('Appointment length updated');
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
      setIsEditingTime(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating end time:', error);
      toast.error('Failed to update appointment length');
    } finally {
      setIsSavingTime(false);
    }
  };

  const handleSyncCalendar = async () => {
    setIsSyncing(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      if (!headers.Authorization) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        headers,
        body: { action: 'create-event', bookingId: booking.id },
      });

      if (error) throw error;
      toast.success('Calendar event synced successfully');
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
    } catch (error: any) {
      console.error('Calendar sync error:', error);
      toast.error(error?.message || 'Failed to sync calendar event');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeletePayment = async () => {
    if (!paymentToDelete) return;

    try {
      const { error } = await supabase
        .from('booking_payments')
        .delete()
        .eq('id', paymentToDelete.id);

      if (error) throw error;

      // Refresh payments (with same deduplication as initial load)
      const { data } = await supabase
        .from('booking_payments')
        .select('*')
        .eq('booking_id', booking.id)
        .order('created_at', { ascending: true });
      setPayments(dedupePayments(data || []));
      toast.success('Payment record deleted successfully');
      setPaymentDeleteDialogOpen(false);
      setPaymentToDelete(null);
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Failed to delete payment record');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      // Delete Google Calendar event first (before DB delete removes the google_event_id)
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', {
            headers,
            body: { action: 'delete-event', bookingId: booking.id },
          });
        }
      } catch (syncErr) {
        console.error('Calendar sync error (non-blocking):', syncErr);
      }

      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', booking.id);

      if (error) {
        toast.error('Failed to delete booking');
        return;
      }

      toast.success('Booking deleted');
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onBookingDelete?.(booking.id);
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Failed to delete booking');
    } finally {
      setIsDeleting(false);
    }
  };

  const durationMinutes = (() => {
    const [sh, sm] = booking.startTime.split(':').map(Number);
    const displayEnd = isEditingTime ? editEndTime : booking.endTime;
    const [eh, em] = displayEnd.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  })();

  const formatTime12 = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
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

  const handleOpenReschedule = () => {
    setNewDate(booking.date);
    setNewStartTime(booking.startTime);
    setNewPractitionerId(booking.practitionerId);
    setNewPractitioner2Id(booking.practitioner2Id || '');
    setRescheduleOpen(true);
  };

  const handleReschedule = async () => {
    if (!newDate || !newStartTime) return;
    setRescheduleLoading(true);
    try {
      const [origSH, origSM] = booking.startTime.split(':').map(Number);
      const [origEH, origEM] = booking.endTime.split(':').map(Number);
      const durationMin2 = (origEH * 60 + origEM) - (origSH * 60 + origSM);
      const [newSH, newSM] = newStartTime.split(':').map(Number);
      const endTotalMin = newSH * 60 + newSM + durationMin2;
      const newEndTime = `${Math.floor(endTotalMin / 60).toString().padStart(2, '0')}:${(endTotalMin % 60).toString().padStart(2, '0')}`;

      const updateData: Record<string, string | null> = {
        booking_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
      };
      if (newPractitionerId && newPractitionerId !== booking.practitionerId) {
        updateData.practitioner_id = newPractitionerId;
      }
      if (isCouplesService && newPractitioner2Id !== (booking.practitioner2Id || '')) {
        updateData.practitioner_2_id = newPractitioner2Id || null;
      }

      // Validate practitioner availability (primary and, for couples, second)
      const selectedPractId = newPractitionerId || booking.practitionerId;
      const selectedPract2Id = isCouplesService ? (newPractitioner2Id || booking.practitioner2Id || '') : '';
      const rescheduleDay = new Date(newDate + 'T12:00:00').getDay();
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
        const practName = practitioners.find(p => p.id === selectedPractId)?.name || 'Practitioner';
        toast.error(`${practName} is not scheduled to work at ${formatTime12(newStartTime)} on this day.`);
        setRescheduleLoading(false);
        return;
      }

      // Check 2nd practitioner schedule for couples bookings
      if (isCouplesService && selectedPract2Id) {
        const { data: avail2Blocks } = await supabase
          .from('availability_blocks')
          .select('start_time, end_time')
          .eq('practitioner_id', selectedPract2Id)
          .eq('day_of_week', rescheduleDay)
          .eq('is_available', true);

        const isWithinSchedule2 = (avail2Blocks || []).some(block => {
          const blockStart = block.start_time.slice(0, 5);
          const blockEnd = block.end_time.slice(0, 5);
          return newStartTime >= blockStart && newEndTime <= blockEnd;
        });

        if (!isWithinSchedule2) {
          const pract2Name = practitioners.find(p => p.id === selectedPract2Id)?.name || 'Second practitioner';
          toast.error(`${pract2Name} is not scheduled to work at ${formatTime12(newStartTime)} on this day.`);
          setRescheduleLoading(false);
          return;
        }
      }

      // Check for overlapping bookings with the selected practitioner(s)
      const { data: conflictBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('booking_date', newDate)
        .neq('status', 'cancelled')
        .neq('id', booking.id)
        .lt('start_time', newEndTime)
        .gt('end_time', newStartTime)
        .or(isCouplesService && selectedPract2Id
          ? `practitioner_id.eq.${selectedPractId},practitioner_2_id.eq.${selectedPractId},practitioner_id.eq.${selectedPract2Id},practitioner_2_id.eq.${selectedPract2Id}`
          : `practitioner_id.eq.${selectedPractId},practitioner_2_id.eq.${selectedPractId}`);

      if (conflictBookings && conflictBookings.length > 0) {
        const names: string[] = [];
        const p1Name = practitioners.find(p => p.id === selectedPractId)?.name;
        const p2Name = selectedPract2Id ? practitioners.find(p => p.id === selectedPract2Id)?.name : null;
        if (p1Name) names.push(p1Name);
        if (p2Name && p2Name !== p1Name) names.push(p2Name);
        const label = names.length > 0 ? names.join(' & ') : 'Practitioner';
        toast.error(`${label} already has a booking during this time.`);
        setRescheduleLoading(false);
        return;
      }

      // Check Google Calendar busy times via public-availability API
      try {
        const { data: availData } = await supabase.functions.invoke('public-availability', {
          body: { startDate: newDate, endDate: newDate },
        });
        const practitionerIds = [selectedPractId, ...(isCouplesService && selectedPract2Id ? [selectedPract2Id] : [])];
        const [slotH, slotM] = newStartTime.split(':').map(Number);
        const slotStartMin = slotH * 60 + slotM;
        const [endH2, endM2] = newEndTime.split(':').map(Number);
        const slotEndMin = endH2 * 60 + endM2;

        for (const pid of practitionerIds) {
          if (!pid) continue;
          if (!availData?.busyTimes?.[pid]) continue;
          const busyTimes = availData.busyTimes[pid] as { start: string; end: string }[];

          const hasCalendarConflict = busyTimes.some(busy => {
            const isAllDay = !busy.start.includes('T');
            if (isAllDay) {
              return newDate >= busy.start && newDate < busy.end;
            }
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            // Convert to HST (UTC-10)
            const bsHST = new Date(busyStart.getTime() - 10 * 60 * 60 * 1000);
            const beHST = new Date(busyEnd.getTime() - 10 * 60 * 60 * 1000);
            const bsDate = bsHST.toISOString().split('T')[0];
            if (bsDate !== newDate) return false;
            const bsMin = bsHST.getUTCHours() * 60 + bsHST.getUTCMinutes();
            const beMin = beHST.getUTCHours() * 60 + beHST.getUTCMinutes();
            return slotStartMin < beMin && slotEndMin > bsMin;
          });

          if (hasCalendarConflict) {
            const practName = practitioners.find(p => p.id === pid)?.name || 'Practitioner';
            toast.error(`${practName} has a calendar conflict during this time.`);
            setRescheduleLoading(false);
            return;
          }
        }
      } catch (e) {
        console.error('Calendar conflict check (non-blocking):', e);
      }

      // Delete old calendar events before updating
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', {
            headers,
            body: { action: 'delete-event', bookingId: booking.id },
          });
        }
      } catch (e) {
        console.error('Calendar delete (non-blocking):', e);
      }

      const { error } = await supabase
        .from('bookings')
        .update(updateData)
        .eq('id', booking.id);

      if (error) throw error;
      debugLog('BookingDetailsDialog.tsx:bookings.update', 'Booking rescheduled', { booking_id: booking.id, booking_date: updateData.booking_date, start_time: updateData.start_time });

      // Re-sync calendar with new time
      try {
        const headers = await getEdgeFunctionHeaders();
        if (headers.Authorization) {
          await supabase.functions.invoke('google-calendar-sync', {
            headers,
            body: { action: 'create-event', bookingId: booking.id },
          });
        }
      } catch (e) {
        console.error('Calendar re-sync (non-blocking):', e);
      }

      // Notify client of reschedule (email + Klaviyo SMS with updated time)
      try {
        await supabase.functions.invoke('notify-staff-booking', {
          body: { bookingId: booking.id, reschedule: true },
        });
      } catch (e) {
        console.warn('Reschedule notification (non-blocking):', e);
      }

      toast.success(`Rescheduled to ${format(new Date(newDate + 'T12:00:00'), 'MMM d, yyyy')} at ${formatTime12(newStartTime)}. Client notified.`);
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
      setRescheduleOpen(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Error rescheduling:', error);
      toast.error('Failed to reschedule booking');
    } finally {
      setRescheduleLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setIsEditingTime(false); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Appointment Details</span>
            <Badge className={statusColors[booking.status] || statusColors.pending}>
              {booking.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Client Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Client</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{booking.clientName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <a href={`mailto:${booking.clientEmail}`} className="text-primary hover:underline">
                  {booking.clientEmail}
                </a>
              </div>
              {booking.clientPhone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <a href={`tel:${booking.clientPhone}`} className="text-primary hover:underline">
                    {booking.clientPhone}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Date & Time</h4>
              {!isEditingTime && (
                <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-xs" onClick={handleStartEdit}>
                  <Pencil className="w-3 h-3" />
                  Adjust Length
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span>{format(parseLocalDate(booking.date), 'EEEE, MMMM d, yyyy')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-muted-foreground" />
                {isEditingTime ? (
                  <div className="flex items-center gap-2">
                    <span>{formatTime(booking.startTime)} -</span>
                    <Select value={editEndTime} onValueChange={setEditEndTime}>
                      <SelectTrigger className="w-[130px] h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {endTimeOptions.map(t => (
                          <SelectItem key={t} value={t}>{formatTime(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground text-xs">({durationMinutes} min)</span>
                    <Button size="sm" variant="sage" className="h-7 px-2 gap-1" onClick={handleSaveTime} disabled={isSavingTime}>
                      <Save className="w-3 h-3" />
                      {isSavingTime ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                ) : (
                  <span>
                    {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                    <span className="text-muted-foreground ml-1">({durationMinutes} min)</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Service */}
          {service && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Service</h4>
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{service.name}</span>
                <span className="text-muted-foreground">
                  ({service.duration} min • ${service.price})
                </span>
              </div>
            </div>
          )}

          {/* Practitioner */}
          {practitioner && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                {practitioner2 ? 'Practitioners' : 'Practitioner'}
              </h4>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground" />
                <span>{practitioner.name}{practitioner2 ? ' (Guest 1)' : ''}</span>
              </div>
              {practitioner2 && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span>{practitioner2.name} (Guest 2)</span>
                </div>
              )}
            </div>
          )}

          {/* Room */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Room</h4>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>{room ? room.name : (!booking.roomId ? 'Outcall' : 'Unknown')}</span>
            </div>
          </div>

          {/* Notes */}
          {booking.notes && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Notes</h4>
              <div className="flex items-start gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                <span className="text-muted-foreground">{booking.notes}</span>
              </div>
            </div>
          )}

          {/* Payments & Charges */}
          {payments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="w-4 h-4" />
                Charges & Payments
              </h4>
              <div className="space-y-2">
                {payments.map((p) => {
                  const typeLabel: Record<string, string> = {
                    deposit: 'Deposit',
                    balance: 'Balance',
                    auto_charge: 'Auto-Charge',
                    tip: 'Tip',
                  };
                  const statusBadge: Record<string, string> = {
                    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                    paid: 'bg-green-100 text-green-800 border-green-200',
                    failed: 'bg-red-100 text-red-800 border-red-200',
                    expired: 'bg-muted text-muted-foreground',
                  };

                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-md border p-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="font-medium">{typeLabel[p.type] || p.type}</span>
                        {p.amount > 0 && (
                          <span className="text-muted-foreground">${Number(p.amount).toFixed(2)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs ${statusBadge[p.status] || ''}`}>
                          {p.status}
                        </Badge>
                        {p.stripe_checkout_url && p.status === 'pending' && (
                          <a
                            href={p.stripe_checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {(p.status === 'pending' || p.status === 'failed') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setPaymentToDelete(p);
                              setPaymentDeleteDialogOpen(true);
                            }}
                            title="Delete payment record"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {payments.some(p => p.paid_at) && (
                <div className="text-xs text-muted-foreground mt-1">
                  {payments.filter(p => p.paid_at).map(p => {
                    const labels: Record<string, string> = { deposit: 'Deposit', balance: 'Balance', auto_charge: 'Auto-Charge', tip: 'Tip' };
                    return (
                      <div key={p.id + '-paid'}>
                        {labels[p.type] || p.type} paid {format(new Date(p.paid_at), 'MMM d, h:mm a')}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between flex-wrap">
          {booking.status === 'confirmed' && (
            <>
              <Button
                variant="outline"
                onClick={handleSendNotification}
                disabled={isSendingNotification}
                className="gap-2"
              >
                <Send className={`w-4 h-4 ${isSendingNotification ? 'animate-pulse' : ''}`} />
                {isSendingNotification ? 'Sending...' : 'Notify Client'}
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenReschedule}
                className="gap-2"
              >
                <CalendarClock className="w-4 h-4" />
                Reschedule
              </Button>
              <Button
                variant="outline"
                onClick={handleSyncCalendar}
                disabled={isSyncing}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Calendar'}
              </Button>
            </>
          )}
          {(booking.status === 'confirmed' || booking.status === 'completed') && (
            <>
              <Button
                variant="outline"
                onClick={() => { navigate(`/complete-payment?booking=${booking.id}`); onOpenChange(false); }}
                className="gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Complete Payment
              </Button>
              <Button
                variant="outline"
                onClick={() => setPosDialogOpen(true)}
                className="gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Custom Charge
              </Button>
            </>
          )}
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Booking
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this booking for {booking.clientName}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment Delete Confirmation Dialog */}
      <AlertDialog open={paymentDeleteDialogOpen} onOpenChange={setPaymentDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this payment record? This action cannot be undone.
              {paymentToDelete && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>Amount:</strong> ${paymentToDelete.amount}
                  </p>
                  <p className="text-sm">
                    <strong>Status:</strong> {paymentToDelete.status}
                  </p>
                  <p className="text-sm">
                    <strong>Type:</strong> {paymentToDelete.payment_type}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePayment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Payment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
             <p className="text-sm text-muted-foreground">
              Reassign to a different practitioner or adjust the date/time. The current time is pre-filled.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><strong>Service:</strong> {service?.name || 'N/A'}</p>
              <p><strong>Current:</strong> {format(parseLocalDate(booking.date), 'MMM d, yyyy')} at {formatTime12(booking.startTime)} – {formatTime12(booking.endTime)}</p>
              <p>
                <strong>{practitioner2 ? 'Practitioners' : 'Practitioner'}:</strong>{' '}
                {practitioner?.name || 'Unassigned'}
                {practitioner2 ? ` & ${practitioner2.name}` : ''}
              </p>
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
                    const isCurrent = p.id === booking.practitionerId;
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
                  This practitioner is not scheduled to work at {formatTime12(newStartTime)} on {format(parseLocalDate(newDate), 'EEE, MMM d')}. Choose a different time below.
                </p>
              )}
            </div>

            {isCouplesService && (
              <div className="space-y-2">
                <Label>2nd Practitioner</Label>
                <Select value={newPractitioner2Id} onValueChange={setNewPractitioner2Id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select 2nd practitioner" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligiblePractitioners
                      .filter(p => {
                        if (p.id === (newPractitionerId || booking.practitionerId)) return false;
                        return true;
                      })
                      .map(p => {
                        const isAvailable = practitionerAvailabilityAtBookingTime[p.id];
                        const isCurrent = p.id === booking.practitioner2Id;
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
              </div>
            )}

            <div className="space-y-2">
              <Label>New Date</Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>New Start Time</Label>
              {filteredRescheduleTimeOptions.length === 0 && newDate ? (
                <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-destructive/10 text-destructive text-sm">
                  No available times for this practitioner on this date
                </div>
              ) : (
                <Select value={newStartTime} onValueChange={setNewStartTime}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select time">
                      {newStartTime && formatTime12(newStartTime)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredRescheduleTimeOptions.map(t => (
                      <SelectItem key={t} value={t}>{formatTime12(t)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleOpen(false)} disabled={rescheduleLoading}>
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={rescheduleLoading || !newDate || !newStartTime} className="bg-sage hover:bg-sage-dark">
              {rescheduleLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirm Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <POSChargeDialog
        open={posDialogOpen}
        onOpenChange={setPosDialogOpen}
        defaultClientName={booking.clientName}
        defaultClientEmail={booking.clientEmail}
        bookingId={booking.id}
      />
    </Dialog>
  );
}

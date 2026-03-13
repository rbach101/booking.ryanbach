import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Calendar as CalendarIcon, Clock, Search, Loader2, CreditCard, ExternalLink, Package, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Practitioner, Room, Service, Booking, DayOfWeek } from '@/types/booking';
import { INSURANCE_DISCLAIMER } from '@/data/fullServiceData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { usePractitioners } from '@/hooks/usePractitioners';

// Business timezone - Hawaii
const BUSINESS_TIMEZONE = 'Pacific/Honolulu';

const DAY_MAP: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

interface BusyTime {
  start: string;
  end: string;
}

interface NewBookingDialogProps {
  practitioners: Practitioner[];
  rooms: Room[];
  services: Service[];
  existingBookings: Booking[];
  onBookingCreate?: (booking: Omit<Booking, 'id' | 'createdAt'>) => void;
  trigger?: React.ReactNode;
  defaultCustomer?: {
    name: string;
    email: string;
    phone?: string;
  };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NewBookingDialog({
  practitioners,
  rooms,
  services,
  existingBookings,
  onBookingCreate,
  trigger,
  defaultCustomer,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange
}: NewBookingDialogProps) {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [busyTimes, setBusyTimes] = useState<{ [practitionerId: string]: BusyTime[] }>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [sendPaymentLink, setSendPaymentLink] = useState(false);
  const [sendingPaymentLink, setSendingPaymentLink] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [usePackageSession, setUsePackageSession] = useState(false);
  const [payInFull, setPayInFull] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen;
  
  // Fetch real practitioner availability from database
  const { data: dbPractitioners } = usePractitioners();
  
  // Use DB practitioners for availability checking
  const practitionersWithAvailability = useMemo(() => {
    return dbPractitioners || practitioners;
  }, [dbPractitioners, practitioners]);
  
  // Fetch customers from database
  const { data: customers = [] } = useQuery({
    queryKey: ['booking-customers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('last_name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch active memberships and packages for the selected customer
  const { data: customerCredits } = useQuery({
    queryKey: ['customer-credits', selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return { memberships: [], packages: [] };
      
      const today = new Date().toISOString().split('T')[0];
      
      const [membershipsRes, packagesRes] = await Promise.all([
        supabase
          .from('customer_memberships')
          .select('*, membership_plans(name, price, service_ids)')
          .eq('customer_id', selectedCustomerId)
          .eq('status', 'active')
          .gt('sessions_remaining', 0),
        supabase
          .from('customer_packages')
          .select('*, session_packages(name, price, service_ids)')
          .eq('customer_id', selectedCustomerId)
          .eq('status', 'active')
          .gt('sessions_remaining', 0),
      ]);

      // Filter out expired packages client-side
      const activePackages = (packagesRes.data || []).filter(p => {
        if (!p.expires_at) return true;
        return p.expires_at >= today;
      });

      return {
        memberships: membershipsRes.data || [],
        packages: activePackages,
      };
    },
    enabled: !!selectedCustomerId,
  });

  // applicableCredit memo is placed after formData/selectedService declarations below

  // Filter customers based on search
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery) return customers.slice(0, 10);
    const query = customerSearchQuery.toLowerCase();
    return customers.filter(c => 
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(query) ||
      c.email.toLowerCase().includes(query) ||
      (c.phone && c.phone.includes(query))
    ).slice(0, 10);
  }, [customers, customerSearchQuery]);
  
  const [date, setDate] = useState<Date>();
  const [formData, setFormData] = useState({
    clientName: defaultCustomer?.name || '',
    clientEmail: defaultCustomer?.email || '',
    clientPhone: defaultCustomer?.phone || '',
    practitionerId: '',
    practitioner2Id: '', // For couples massages
    roomId: '',
    serviceType: '',
    startTime: '',
    notes: '',
    location: '', // For outcall services
  });

  // Update form when defaultCustomer changes
  useEffect(() => {
    if (defaultCustomer) {
      setFormData(prev => ({
        ...prev,
        clientName: defaultCustomer.name,
        clientEmail: defaultCustomer.email,
        clientPhone: defaultCustomer.phone || ''
      }));
    }
  }, [defaultCustomer]);

  // Fetch busy times when date or practitioner changes
  useEffect(() => {
    if (!date) return;

    // Clear the selected time when date or practitioner changes
    setFormData(prev => ({ ...prev, startTime: '' }));

    const fetchBusyTimes = async () => {
      setLoadingAvailability(true);
      setBusyTimes({});
      const dateStr = format(date, 'yyyy-MM-dd');
      
      try {
        // Fetch Google Calendar busy times via public endpoint
        const { data, error } = await supabase.functions.invoke('public-availability', {
          body: { 
            date: dateStr,
            practitionerIds: formData.practitionerId ? [formData.practitionerId] : undefined
          },
        });

        if (!error && data?.busyTimes) {
          setBusyTimes(data.busyTimes);
        }
      } catch (err) {
        console.error('Error fetching busy times:', err);
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchBusyTimes();
  }, [date, formData.practitionerId]);

  const createBookingMutation = useMutation({
    mutationFn: async (bookingData: {
      client_name: string;
      client_email: string;
      client_phone: string;
      practitioner_id: string | null;
      practitioner_2_id?: string | null;
      room_id: string | null;
      service_id: string | null;
      booking_date: string;
      start_time: string;
      end_time: string;
      status: string;
      notes: string | null;
      total_amount: number | null;
      balance_due?: number | null;
      is_insurance_booking?: boolean;
    }) => {
      // Route through create-appointment edge function for server-side
      // Google Calendar conflict checking (double prevention)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated. Please log in.');
      const { data, error } = await supabase.functions.invoke('create-appointment', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          clientName: bookingData.client_name,
          clientEmail: bookingData.client_email,
          clientPhone: bookingData.client_phone,
          practitionerId: bookingData.practitioner_id,
          practitioner2Id: bookingData.practitioner_2_id,
          roomId: bookingData.room_id,
          serviceId: bookingData.service_id,
          bookingDate: bookingData.booking_date,
          startTime: bookingData.start_time,
          endTime: bookingData.end_time,
          status: bookingData.status,
          notes: bookingData.notes,
          totalAmount: bookingData.total_amount,
          balanceDue: bookingData.balance_due,
          isInsuranceBooking: bookingData.is_insurance_booking,
        },
      });
      
      if (error) {
        const message = await getFunctionErrorMessage(error);
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error('Failed to create booking');
      
      // Fetch the created booking for downstream use
      const { data: booking, error: fetchError } = await supabase
        .from('bookings')
        .select()
        .eq('id', data.booking.id)
        .single();
      if (fetchError) throw fetchError;
      return booking;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-bookings'] });

      // Calendar sync and client notification are handled by the create-appointment edge function
      // Only handle post-booking actions here (payment links, package sessions)

      // Decrement package/membership session if used
      if (usePackageSession && applicableCredit && data) {
        try {
          const { error: decrementError } = await supabase
            .from(applicableCredit.table)
            .update({
              sessions_remaining: applicableCredit.sessionsRemaining - 1,
              sessions_used: applicableCredit.sessionsUsed + 1,
            })
            .eq('id', applicableCredit.id);

          if (decrementError) {
            console.error('Failed to decrement session:', decrementError);
            toast.error('Booking created but failed to decrement session credit');
          } else {
            queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
          }
        } catch (err) {
          console.error('Session decrement error (non-blocking):', err);
        }
      }
      
      // Send payment link if requested (skip if using package/membership)
      if (sendPaymentLink && !usePackageSession && !payInFull && data) {
        setSendingPaymentLink(true);
        try {
          const selectedServiceObj = services.find(s => s.name === formData.serviceType);
          const depositAmount = selectedServiceObj ? Math.round(selectedServiceObj.price * 0.5 * 100) / 100 : 0;
          const response = await supabase.functions.invoke('send-payment-link', {
            body: {
              bookingId: data.id,
              amount: depositAmount,
              clientEmail: formData.clientEmail,
              clientName: formData.clientName,
              serviceName: selectedServiceObj?.name || 'Appointment',
              bookingDate: date ? format(date, 'MMM d, yyyy') : '',
              startTime: formData.startTime ? formatTime12Hour(formData.startTime) : '',
            },
          });

          if (response.error) throw new Error(await getFunctionErrorMessage(response.error));
          
          if (response.data?.url) {
            window.open(response.data.url, '_blank');
            toast.success('Payment link created! You can share it with the client.');
          }
        } catch (err) {
          console.error('Error sending payment link:', err);
          toast.error(err instanceof Error ? err.message : 'Booking created, but failed to generate payment link');
        } finally {
          setSendingPaymentLink(false);
        }
      } else if (usePackageSession) {
        toast.success(`Booking created — session applied from ${applicableCredit?.name}`);
      } else {
        toast.success('Booking created successfully');
      }

      setOpen(false);
      setSendPaymentLink(false);
      setUsePackageSession(false);
      setPayInFull(false);
      setAutoApprove(false);
      setSelectedCustomerId(null);
      setFormData({
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        practitionerId: '',
        practitioner2Id: '',
        roomId: '',
        serviceType: '',
        startTime: '',
        notes: '',
        location: '',
      });
      setDate(undefined);
    },
    onError: (error) => {
      toast.error('Failed to create booking: ' + error.message);
    },
  });

  const selectedService = services.find(s => s.name === formData.serviceType);
  const isOutcallService = selectedService?.category === 'outcall' || (selectedService as any)?.is_outcall;
  const isCouplesService = selectedService?.is_couples || selectedService?.name?.toLowerCase().includes('couples');
  const isInsuranceService = selectedService?.category === 'insurance';

  const handleDateSelect = (newDate: Date | undefined) => {
    setDate(newDate);
    if (!newDate) return;
    const dayOfWeek = DAY_MAP[newDate.getDay()];
    setFormData(prev => {
      const updates: Partial<typeof prev> = {};
      if (prev.practitionerId) {
        const p = practitionersWithAvailability.find(x => x.id === prev.practitionerId);
        if (p && (p.availability[dayOfWeek] || []).length === 0) {
          updates.practitionerId = '';
          updates.startTime = '';
        }
      }
      if (prev.practitioner2Id) {
        const p = practitionersWithAvailability.find(x => x.id === prev.practitioner2Id);
        if (p && (p.availability[dayOfWeek] || []).length === 0) {
          updates.practitioner2Id = '';
        }
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  };
  // Find applicable credit (membership or package) for selected service
  const applicableCredit = useMemo(() => {
    if (!customerCredits || !selectedService) return null;
    const serviceId = selectedService.id;
    
    for (const m of customerCredits.memberships) {
      const plan = m.membership_plans as any;
      const serviceIds = plan?.service_ids || [];
      if (serviceIds.length === 0 || serviceIds.includes(serviceId)) {
        return { type: 'membership' as const, id: m.id, name: plan?.name || 'Membership', sessionsRemaining: m.sessions_remaining, sessionsUsed: m.sessions_used, table: 'customer_memberships' as const };
      }
    }
    
    for (const p of customerCredits.packages) {
      const pkg = p.session_packages as any;
      const serviceIds = pkg?.service_ids || [];
      if (serviceIds.length === 0 || serviceIds.includes(serviceId)) {
        return { type: 'package' as const, id: p.id, name: pkg?.name || 'Package', sessionsRemaining: p.sessions_remaining, sessionsUsed: p.sessions_used, table: 'customer_packages' as const };
      }
    }
    
    return null;
  }, [customerCredits, selectedService]);
  // Format 24-hour time to 12-hour format
  const formatTime12Hour = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };
  
  const OUTCALL_BUFFER_MINUTES = 30;

  const calculateEndTime = (start: string, durationMinutes: number) => {
    if (!start) return '';
    const [hours, minutes] = start.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  // For outcall services, add 30-min buffer to end time
  const serviceDurationWithBuffer = selectedService
    ? selectedService.duration + (isOutcallService ? OUTCALL_BUFFER_MINUTES : 0)
    : 0;

  const endTime = selectedService 
    ? calculateEndTime(formData.startTime, serviceDurationWithBuffer)
    : '';
  
  // Display end time (without buffer) for UI display
  const displayEndTime = selectedService
    ? calculateEndTime(formData.startTime, selectedService.duration)
    : '';

  const checkConflicts = () => {
    if (!date || !formData.startTime || !endTime) return null;
    
    const dateStr = format(date, 'yyyy-MM-dd');
    const startMinutes = parseInt(formData.startTime.split(':')[0]) * 60 + parseInt(formData.startTime.split(':')[1]);
    const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);

    const bookingConflicts = existingBookings.filter(booking => {
      if (booking.date !== dateStr) return false;
      if (booking.status === 'cancelled') return false;
      
      const bookingStart = parseInt(booking.startTime.split(':')[0]) * 60 + parseInt(booking.startTime.split(':')[1]);
      const bookingEnd = parseInt(booking.endTime.split(':')[0]) * 60 + parseInt(booking.endTime.split(':')[1]);
      
      const timeOverlaps = startMinutes < bookingEnd && endMinutes > bookingStart;
      const roomConflict = formData.roomId && booking.roomId === formData.roomId && timeOverlaps;
      const practitionerConflict = formData.practitionerId && booking.practitionerId === formData.practitionerId && timeOverlaps;
      const practitioner2Conflict = formData.practitioner2Id && (
        booking.practitionerId === formData.practitioner2Id || booking.practitioner2Id === formData.practitioner2Id
      ) && timeOverlaps;
      
      return roomConflict || practitionerConflict || practitioner2Conflict;
    });

    if (bookingConflicts.length > 0) return bookingConflicts;

    // Also check Google Calendar busy times for the selected practitioner(s)
    const practitionerIds = [formData.practitionerId, formData.practitioner2Id].filter(Boolean);
    for (const pId of practitionerIds) {
      const allBusy = busyTimes[pId] || [];
      for (const busy of allBusy) {
        try {
          const isAllDay = !String(busy.start).includes('T');
          if (isAllDay) {
            // All-day event covers entire day
            if (dateStr >= busy.start && dateStr < busy.end) {
              return [{ id: 'calendar-block', clientName: 'Google Calendar block (all day)', date: dateStr, startTime: '00:00', endTime: '23:59', status: 'confirmed', practitionerId: pId, roomId: '', serviceType: '', clientEmail: '', clientPhone: '', notes: '', createdAt: '' }];
            }
          } else {
            const busyStartUTC = parseISO(busy.start);
            const busyEndUTC = parseISO(busy.end);
            const busyStartHawaii = toZonedTime(busyStartUTC, BUSINESS_TIMEZONE);
            const busyEndHawaii = toZonedTime(busyEndUTC, BUSINESS_TIMEZONE);
            const busyDate = format(busyStartHawaii, 'yyyy-MM-dd');
            if (busyDate !== dateStr) continue;
            const busyStartMin = busyStartHawaii.getHours() * 60 + busyStartHawaii.getMinutes();
            const busyEndMin = busyEndHawaii.getHours() * 60 + busyEndHawaii.getMinutes();
            if (startMinutes < busyEndMin && endMinutes > busyStartMin) {
              const pName = practitioners.find(p => p.id === pId)?.name || 'Practitioner';
              return [{ id: 'calendar-block', clientName: `${pName} has a Google Calendar block during this time`, date: dateStr, startTime: format(busyStartHawaii, 'HH:mm'), endTime: format(busyEndHawaii, 'HH:mm'), status: 'confirmed', practitionerId: pId, roomId: '', serviceType: '', clientEmail: '', clientPhone: '', notes: '', createdAt: '' }];
            }
          }
        } catch {
          // Skip malformed busy entries
        }
      }
    }

    return null;
  };

  const conflicts = checkConflicts();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    if (!formData.practitionerId) {
      toast.error('Please select a practitioner');
      return;
    }

    if (isOutcallService && (!formData.location || formData.location.trim().length < 10)) {
      toast.error('Please enter a complete location address for this outcall service');
      return;
    }

    if (conflicts) {
      toast.error('Cannot create booking - time slot conflicts detected');
      return;
    }

    const selectedServiceObj = services.find(s => s.name === formData.serviceType);

    // Build notes with location for outcall services
    let fullNotes = formData.notes || '';
    if (isOutcallService && formData.location) {
      fullNotes = `[OUTCALL LOCATION: ${formData.location}]\n[Outcall service - ${OUTCALL_BUFFER_MINUTES}min buffer included]\n${fullNotes}`.trim();
    }

    // Determine pricing based on package/membership usage (insurance: no deposit/balance)
    const usingCredit = usePackageSession && applicableCredit;
    const totalAmount = isInsuranceService ? 0 : (usingCredit ? 0 : (selectedServiceObj?.price || null));
    const balanceDue = isInsuranceService ? 0 : (usingCredit ? 0 : payInFull ? (selectedServiceObj?.price || null) : (sendPaymentLink && selectedServiceObj ? Math.round(selectedServiceObj.price * 0.5 * 100) / 100 : (selectedServiceObj?.price || null)));

    // Build notes with credit usage info
    if (usingCredit) {
      fullNotes = `[${applicableCredit.type.toUpperCase()}: ${applicableCredit.name} — session applied]\n${fullNotes}`.trim();
    }
    if (payInFull) {
      fullNotes = `[PAY IN FULL AT APPOINTMENT — no deposit required]\n${fullNotes}`.trim();
    }

    // Determine booking status
    let bookingStatus = 'pending_approval';
    if (autoApprove) {
      bookingStatus = 'confirmed';
    }

    // Create booking in database
    createBookingMutation.mutate({
      client_name: formData.clientName,
      client_email: formData.clientEmail,
      client_phone: formData.clientPhone || null,
      practitioner_id: formData.practitionerId || null,
      practitioner_2_id: isCouplesService && formData.practitioner2Id ? formData.practitioner2Id : null,
      room_id: isOutcallService ? null : (formData.roomId || null),
      service_id: selectedServiceObj?.id || null,
      booking_date: format(date, 'yyyy-MM-dd'),
      start_time: formData.startTime,
      end_time: endTime,
      status: bookingStatus,
      notes: fullNotes || null,
      total_amount: totalAmount,
      balance_due: balanceDue,
      is_insurance_booking: isInsuranceService,
    });

    // onBookingCreate callback removed — edge function handles creation
  };

  // Calculate available time slots based on practitioner availability and busy times
  const timeOptions = useMemo(() => {
    if (!date) {
      // Return default time slots when no date selected
      return Array.from({ length: 48 }, (_, i) => {
        const hour = Math.floor(i / 4) + 8;
        const minute = (i % 4) * 15;
        if (hour > 19) return null;
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }).filter(Boolean) as string[];
    }

    const dayOfWeek = DAY_MAP[date.getDay()];
    const dateStr = format(date, 'yyyy-MM-dd');
    const serviceDuration = selectedService?.duration || 60;
    
    // Find the selected practitioner from DB data
    const selectedPractitioner = formData.practitionerId
      ? practitionersWithAvailability.find(p => p.id === formData.practitionerId)
      : null;

    // If no practitioner selected, show union of all eligible practitioners' schedules
    if (!selectedPractitioner) {
      const eligiblePractitioners = practitionersWithAvailability.filter(p => {
        if (selectedService?.practitionerIds && selectedService.practitionerIds.length > 0) {
          if (!selectedService.practitionerIds.includes(p.id)) return false;
        }
        const hasSchedule = Object.values(p.availability || {}).some(
          (slots: any[]) => slots && slots.length > 0
        );
        return hasSchedule;
      });

      const unionSlots = new Set<string>();
      eligiblePractitioners.forEach(p => {
        const daySlots = p.availability[dayOfWeek] || [];
        daySlots.forEach(slot => {
          const startH = parseInt(slot.start.split(':')[0]);
          const startM = parseInt(slot.start.split(':')[1] || '0');
          const endH = parseInt(slot.end.split(':')[0]);
          const endM = parseInt(slot.end.split(':')[1] || '0');
          const slotStart = startH * 60 + startM;
          const slotEnd = endH * 60 + endM;
          for (let m = slotStart; m < slotEnd; m += 15) {
            const h = Math.floor(m / 60);
            const min = m % 60;
            unionSlots.add(`${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
          }
        });
      });

      return Array.from(unionSlots).sort();
    }

    // Get practitioner's availability for this day
    const dayAvailability = selectedPractitioner.availability[dayOfWeek] || [];
    if (dayAvailability.length === 0) {
      return []; // No availability for this day
    }

    const allSlots: string[] = [];

    dayAvailability.forEach(slot => {
      const startHour = parseInt(slot.start.split(':')[0]);
      const startMin = parseInt(slot.start.split(':')[1] || '0');
      const endHour = parseInt(slot.end.split(':')[0]);
      const endMin = parseInt(slot.end.split(':')[1] || '0');
      
      const slotStartMinutes = startHour * 60 + startMin;
      const slotEndMinutes = endHour * 60 + endMin;

      // Generate 15-minute intervals within this availability window
      for (let minutes = slotStartMinutes; minutes < slotEndMinutes; minutes += 15) {
        const hour = Math.floor(minutes / 60);
        const min = minutes % 60;
        const timeSlot = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const slotEndTime = minutes + serviceDuration;
        
        // Check if this slot conflicts with existing bookings
        const hasBookingConflict = existingBookings.some(booking => {
          if (booking.date !== dateStr) return false;
          if (booking.status === 'cancelled') return false;
          if (formData.practitionerId && booking.practitionerId !== formData.practitionerId) return false;
          
          const bookingStart = parseInt(booking.startTime.split(':')[0]) * 60 + parseInt(booking.startTime.split(':')[1]);
          const bookingEnd = parseInt(booking.endTime.split(':')[0]) * 60 + parseInt(booking.endTime.split(':')[1]);
          
          return minutes < bookingEnd && slotEndTime > bookingStart;
        });

        if (hasBookingConflict) continue;

        // Check against Google Calendar busy times
        const allBusy = busyTimes[formData.practitionerId] || [];

        const hasBusyConflict = allBusy.some(busy => {
          // Parse UTC time and convert to Hawaii timezone
          const busyStartUTC = parseISO(busy.start);
          const busyEndUTC = parseISO(busy.end);
          
          // Convert to Hawaii timezone
          const busyStartHawaii = toZonedTime(busyStartUTC, BUSINESS_TIMEZONE);
          const busyEndHawaii = toZonedTime(busyEndUTC, BUSINESS_TIMEZONE);
          
          const busyDate = format(busyStartHawaii, 'yyyy-MM-dd');
          
          // Check if busy time is on the selected date
          if (busyDate !== dateStr) return false;

          // Get hours/minutes in Hawaii timezone
          const busyStartMinutes = busyStartHawaii.getHours() * 60 + busyStartHawaii.getMinutes();
          const busyEndMinutes = busyEndHawaii.getHours() * 60 + busyEndHawaii.getMinutes();

          return minutes < busyEndMinutes && slotEndTime > busyStartMinutes;
        });

        if (hasBusyConflict) continue;

        // Check slot fits within practitioner's availability window
        if (slotEndTime <= slotEndMinutes && !allSlots.includes(timeSlot)) {
          allSlots.push(timeSlot);
        }
      }
    });

    return allSlots.sort();
  }, [date, formData.practitionerId, selectedService, practitionersWithAvailability, existingBookings, busyTimes]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="sage">New Booking</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Create New Booking</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Client Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Client Information
              </h4>
              <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="gap-2">
                    <Search className="w-4 h-4" />
                    Find Customer
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="end">
                  <Command>
                    <CommandInput 
                      placeholder="Search by name, email, or phone..." 
                      value={customerSearchQuery}
                      onValueChange={setCustomerSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No customers found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCustomers.map(customer => (
                          <CommandItem
                            key={customer.id}
                            value={`${customer.first_name} ${customer.last_name} ${customer.email}`}
                            onSelect={() => {
                              setFormData(prev => ({
                                ...prev,
                                clientName: `${customer.first_name} ${customer.last_name}`,
                                clientEmail: customer.email,
                                clientPhone: customer.phone || ''
                              }));
                              setSelectedCustomerId(customer.id);
                              setUsePackageSession(false);
                              setCustomerSearchOpen(false);
                              setCustomerSearchQuery('');
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                              <span className="text-xs text-muted-foreground">{customer.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Full Name</Label>
                <Input
                  id="clientName"
                  value={formData.clientName}
                  onChange={e => setFormData(prev => ({ ...prev, clientName: e.target.value }))}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Phone</Label>
                <Input
                  id="clientPhone"
                  type="tel"
                  value={formData.clientPhone}
                  onChange={e => setFormData(prev => ({ ...prev, clientPhone: e.target.value }))}
                  placeholder="(808) 555-0123"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Email</Label>
              <Input
                id="clientEmail"
                type="email"
                value={formData.clientEmail}
                onChange={e => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
                placeholder="john@email.com"
                required
              />
            </div>
          </div>

          {/* Appointment Details */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
              Appointment Details
            </h4>
            
            <div className="space-y-2">
              <Label>Service</Label>
              <Select
                value={formData.serviceType}
                onValueChange={value => {
                  const newService = services.find(s => s.name === value);
                  setFormData(prev => {
                    const eligibleIds = newService?.practitionerIds;
                    const shouldClearPractitioner = eligibleIds && eligibleIds.length > 0 && prev.practitionerId && !eligibleIds.includes(prev.practitionerId);
                    const isCouples = (newService as any)?.is_couples || newService?.name?.toLowerCase().includes('couples');
                    return { ...prev, serviceType: value, ...(shouldClearPractitioner ? { practitionerId: '' } : {}), ...(!isCouples ? { practitioner2Id: '' } : {}) };
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map(service => (
                    <SelectItem key={service.id} value={service.name}>
                      <div className="flex items-center justify-between w-full">
                        <span>{service.name}</span>
                        <span className="text-muted-foreground ml-2">
                          {service.duration}min - ${service.price}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isInsuranceService && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{INSURANCE_DISCLAIMER}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={handleDateSelect}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                      autoFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Start Time</Label>
                {loadingAvailability ? (
                  <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-muted/30">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Checking availability...</span>
                  </div>
                ) : timeOptions.length === 0 && formData.practitionerId && date ? (
                  <div className="flex items-center gap-2 h-10 px-3 py-2 border rounded-md bg-destructive/10 text-destructive text-sm">
                    No available times for this practitioner on this date
                  </div>
                ) : (
                  <Select
                    value={formData.startTime}
                    onValueChange={value => setFormData(prev => ({ ...prev, startTime: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select time">
                        {formData.startTime && formatTime12Hour(formData.startTime)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map(time => (
                        <SelectItem key={time} value={time}>
                          {formatTime12Hour(time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {selectedService && formData.startTime && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>
                  Duration: {selectedService.duration} minutes
                  {displayEndTime && ` (ends at ${formatTime12Hour(displayEndTime)})`}
                  {isOutcallService && ` + ${OUTCALL_BUFFER_MINUTES}min travel buffer`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Practitioner</Label>
                <Select
                  value={formData.practitionerId}
                  onValueChange={value => setFormData(prev => ({ ...prev, practitionerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select practitioner" />
                  </SelectTrigger>
                  <SelectContent>
                    {practitionersWithAvailability
                      .filter(p => {
                        // Filter by service's practitioner_ids if a service is selected
                        if (selectedService?.practitionerIds && selectedService.practitionerIds.length > 0) {
                          if (!selectedService.practitionerIds.includes(p.id)) return false;
                        }
                        // Filter out practitioners with no availability blocks set
                        const hasSchedule = Object.values(p.availability || {}).some(
                          (slots: any[]) => slots && slots.length > 0
                        );
                        if (!hasSchedule) return false;
                        // When date is selected, only show practitioners available on that day
                        if (date) {
                          const dayOfWeek = DAY_MAP[date.getDay()];
                          if ((p.availability[dayOfWeek] || []).length === 0) return false;
                        }
                        return true;
                      })
                      .map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isCouplesService && (
                <div className="space-y-2">
                  <Label>2nd Practitioner</Label>
                  <Select
                    value={formData.practitioner2Id}
                    onValueChange={value => setFormData(prev => ({ ...prev, practitioner2Id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select 2nd practitioner" />
                    </SelectTrigger>
                    <SelectContent>
                      {practitionersWithAvailability
                        .filter(p => {
                          if (selectedService?.practitionerIds && selectedService.practitionerIds.length > 0) {
                            if (!selectedService.practitionerIds.includes(p.id)) return false;
                          }
                          if (p.id === formData.practitionerId) return false;
                          // Filter out practitioners with no availability blocks set
                          const hasSchedule = Object.values(p.availability || {}).some(
                            (slots: any[]) => slots && slots.length > 0
                          );
                          if (!hasSchedule) return false;
                          // When date is selected, only show practitioners available on that day
                          if (date) {
                            const dayOfWeek = DAY_MAP[date.getDay()];
                            if ((p.availability[dayOfWeek] || []).length === 0) return false;
                          }
                          return true;
                        })
                        .map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {isOutcallService ? (
                <div className="space-y-2 sm:col-span-2">
                  <div className="rounded-lg border border-accent bg-accent/10 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-accent/20 text-accent-foreground border-accent/40 text-xs">
                        Outcall
                      </Badge>
                      <span className="text-xs text-muted-foreground">No room assignment — {OUTCALL_BUFFER_MINUTES}min travel buffer auto-added</span>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="location">Location Address *</Label>
                      <Textarea
                        id="location"
                        value={formData.location}
                        onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="Enter the full street address, city, and zip code&#10;e.g., 123 Kalakaua Ave, Honolulu, HI 96815"
                        rows={2}
                        required
                      />
                      {formData.location && formData.location.trim().length > 0 && formData.location.trim().length < 10 && (
                        <p className="text-xs text-destructive">Please enter a complete address</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Room</Label>
                  <Select
                    value={formData.roomId}
                    onValueChange={value => setFormData(prev => ({ ...prev, roomId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select room" />
                    </SelectTrigger>
                    <SelectContent>
                      {rooms.map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: room.color }}
                            />
                            {room.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {conflicts && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm text-destructive font-medium">
                  Scheduling Conflict Detected
                </p>
                <ul className="text-xs text-destructive/80 mt-1 space-y-1">
                  {conflicts.map(c => (
                    <li key={c.id}>
                      • {c.clientName} at {c.startTime} - {c.endTime}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any special requests or notes..."
              rows={3}
            />
          </div>

          {/* Membership/Package Credit Banner */}
          {applicableCredit && (
            <div className="flex items-start space-x-3 rounded-lg border border-primary/30 p-4 bg-primary/5">
              <Checkbox
                id="usePackageSession"
                checked={usePackageSession}
                onCheckedChange={(checked) => {
                  setUsePackageSession(checked === true);
                  if (checked) setSendPaymentLink(false);
                }}
              />
              <div className="space-y-1">
                <Label htmlFor="usePackageSession" className="flex items-center gap-2 cursor-pointer font-medium">
                  <Package className="w-4 h-4" />
                  Use {applicableCredit.type === 'membership' ? 'Membership' : 'Package'} Session
                </Label>
                <p className="text-xs text-muted-foreground">
                  <Badge variant="secondary" className="mr-1.5 text-xs">
                    {applicableCredit.name}
                  </Badge>
                  {applicableCredit.sessionsRemaining} session{applicableCredit.sessionsRemaining !== 1 ? 's' : ''} remaining — no charge will be applied
                </p>
              </div>
            </div>
          )}

          {/* Payment Options */}
          {selectedService && !usePackageSession && (
            <div className="space-y-3">
              {/* Pay in Full Option */}
              <div className="flex items-start space-x-3 rounded-lg border border-border/50 p-4 bg-secondary/30">
                <Checkbox
                  id="payInFull"
                  checked={payInFull}
                  onCheckedChange={(checked) => {
                    setPayInFull(checked === true);
                    if (checked) setSendPaymentLink(false);
                  }}
                />
                <div className="space-y-1">
                  <Label htmlFor="payInFull" className="flex items-center gap-2 cursor-pointer font-medium">
                    <CreditCard className="w-4 h-4" />
                    Pay in Full at Appointment
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    No deposit will be sent or required. Staff will manually charge the client ${selectedService.price.toFixed(2)} at the time of appointment.
                  </p>
                </div>
              </div>

              {/* Send Deposit Payment Link Option */}
              {!payInFull && (
                <div className="flex items-start space-x-3 rounded-lg border border-border/50 p-4 bg-secondary/30">
                  <Checkbox
                    id="sendPaymentLink"
                    checked={sendPaymentLink}
                    onCheckedChange={(checked) => setSendPaymentLink(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="sendPaymentLink" className="flex items-center gap-2 cursor-pointer font-medium">
                      <CreditCard className="w-4 h-4" />
                      Send Deposit Payment Link (50%)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Generate a Stripe payment link for ${(selectedService.price * 0.5).toFixed(2)} deposit (50% of ${selectedService.price.toFixed(2)}). Remaining balance will be charged at check-in. Opens in a new tab for you to share with the client.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Auto Approve Option */}
          <div className="flex items-start space-x-3 rounded-lg border border-border/50 p-4 bg-secondary/30">
            <Checkbox
              id="autoApprove"
              checked={autoApprove}
              onCheckedChange={(checked) => setAutoApprove(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="autoApprove" className="flex items-center gap-2 cursor-pointer font-medium">
                <Sparkles className="w-4 h-4" />
                Auto Approve Appointment
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically confirm this appointment instead of requiring manual approval.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="sage"
              disabled={!!conflicts || createBookingMutation.isPending || sendingPaymentLink}
            >
              {sendingPaymentLink ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating Link...
                </>
              ) : sendPaymentLink ? (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  Create & Send Link
                </>
              ) : (
                'Create Booking'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

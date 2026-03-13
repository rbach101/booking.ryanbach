import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, startOfDay, parseISO, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useQuery } from '@tanstack/react-query';

// Business timezone - Hawaii
const BUSINESS_TIMEZONE = 'Pacific/Honolulu';
import { FullService, practitioners as mockPractitioners, INSURANCE_DISCLAIMER } from '@/data/fullServiceData';
import { Practitioner, DayOfWeek } from '@/types/booking';
import { usePractitioners } from '@/hooks/usePractitioners';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CalendarIcon, Check, Clock, User, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { klaviyoIdentify, klaviyoTrack } from '@/lib/klaviyo';
import { safeRedirect } from '@/lib/safeRedirect';
import { WeekAvailabilityView } from './WeekAvailabilityView';

interface ExistingBooking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  practitioner_id: string | null;
  room_id: string | null;
  status: string | null;
}

interface BusyTime {
  start: string;
  end: string;
}
// Extra images
import essentialOilsImg from '@/assets/extras/essential-oils-new.webp';
import hotStonesImg from '@/assets/extras/hot-stones-new.webp';
import hotStoneFacialImg from '@/assets/extras/hot-stone-facial-new.webp';
import redLightImg from '@/assets/extras/red-light-new.jpeg';
import cuppingImg from '@/assets/extras/cupping-new.jpeg';
import arnicaOilImg from '@/assets/extras/arnica-oil-new.jpeg';
import deepBlueImg from '@/assets/extras/deep-blue-new.png';
import aloeGelImg from '@/assets/extras/aloe-gel.webp';
import biomatImg from '@/assets/extras/biomat-new.webp';

interface BookingWizardProps {
  service: FullService;
  onBack: () => void;
  onComplete: (booking: BookingDetails) => void;
}

export interface BookingDetails {
  service: FullService;
  practitioner: Practitioner | null;
  practitioner2?: Practitioner | null; // For couples massage
  date: Date;
  time: string;
  extras: string[];
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes: string;
}

const STEPS = [
  { id: 1, label: 'Service' },
  { id: 2, label: 'Time' },
  { id: 3, label: 'Extras' },
  { id: 4, label: 'Details' },
  { id: 5, label: 'Review' },
];

const EXTRAS = [
  { id: 'essential-oils', name: 'Essential Oils', price: 20, description: 'Premium aromatherapy enhancement', image: essentialOilsImg },
  { id: 'hot-stone', name: 'Hot Stone (Pohaku) 15 min', price: 30, description: 'Heated basalt stones for deeper relaxation', image: hotStonesImg },
  { id: 'hot-stone-facial', name: 'Hot Stone Facial 15 min', price: 50, description: 'Rejuvenating facial with hot stones', image: hotStoneFacialImg },
  { id: 'amethyst-biomat', name: 'Amethyst Biomat', price: 15, description: 'Infrared heat therapy mat', image: biomatImg },
  { id: 'red-light', name: 'Red Light Therapy 15 min', price: 45, description: 'Therapeutic red light treatment', image: redLightImg },
  { id: 'cupping', name: 'Cupping Therapy', price: 30, description: 'Traditional cupping for muscle relief', image: cuppingImg },
  { id: 'arnica-oil', name: 'Arnica Deep Tissue Oil', price: 5, description: 'Soothing arnica oil treatment', image: arnicaOilImg },
  { id: 'deep-blue', name: 'Deep Blue Lotion', price: 5, description: 'Cooling muscle relief lotion', image: deepBlueImg },
  { id: 'aloe-gel', name: 'Aloe Gel', price: 5, description: 'Soothing aloe vera application', image: aloeGelImg },
];

const DAY_MAP: Record<number, DayOfWeek> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

export function BookingWizard({ service, onBack, onComplete }: BookingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedPractitioner, setSelectedPractitioner] = useState<Practitioner | null>(null);
  const [selectedPractitioner2, setSelectedPractitioner2] = useState<Practitioner | null>(null); // For couples massage
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [weekStartDate, setWeekStartDate] = useState<Date>(startOfDay(new Date()));
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [availableDays, setAvailableDays] = useState<DayOfWeek[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
  const [startFrom, setStartFrom] = useState('09:00');
  const [finishBy, setFinishBy] = useState('19:00');
  const [clientDetails, setClientDetails] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
    location: '', // For outcall services
  });
  
  // Insurance information for insurance-covered massages
  const [insuranceInfo, setInsuranceInfo] = useState({
    provider: '',
    policyNumber: '',
    groupNumber: '',
    memberId: '',
    subscriberName: '',
    subscriberDob: '',
  });

  const [consentEmail, setConsentEmail] = useState(false);
  const [consentSms, setConsentSms] = useState(false);
  
  const isInsuranceService = service.category === 'insurance';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentRedirecting, setPaymentRedirecting] = useState(false);
  const [weekBookings, setWeekBookings] = useState<{ [dateStr: string]: ExistingBooking[] }>({});
  const [weekBusyTimes, setWeekBusyTimes] = useState<{ [dateStr: string]: { [practitionerId: string]: BusyTime[] } }>({});
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Coupon code support
  const [couponCode, setCouponCode] = useState('');
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);

  const isCouplesMassage = service.isCouples === true;

  // Fetch real practitioner availability from database
  const { data: dbPractitioners, isLoading: loadingPractitioners } = usePractitioners({ publicOnly: true });

  // Fetch practitioner_ids from services table (source of truth) — ensures DB and frontend stay in sync
  const { data: dbService } = useQuery({
    queryKey: ['service-practitioners', service.name],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('practitioner_ids')
        .eq('name', service.name)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data?.practitioner_ids as string[] | null;
    },
    staleTime: 60_000,
  });

  // Use DB practitioner_ids when available, else fallback to fullServiceData
  const effectivePractitionerIds = useMemo(
    () => (dbService && dbService.length > 0 ? dbService : service.practitionerIds),
    [dbService, service.practitionerIds]
  );

  // Get available practitioners for this service, using real DB availability
  const availablePractitioners = useMemo(() => {
    // Use database practitioners if available, fallback to mock data
    const practitioners = dbPractitioners || mockPractitioners;
    return practitioners.filter(p => effectivePractitionerIds.includes(p.id));
  }, [effectivePractitionerIds, dbPractitioners]);

  // Fetch availability from single API call (bookings + busy times combined)
  useEffect(() => {
    const fetchWeekAvailability = async () => {
      setLoadingAvailability(true);
      // CRITICAL: Clear stale data immediately so old busy times don't leak into new week
      setWeekBookings({});
      setWeekBusyTimes({});
      
      try {
        const startDateStr = format(weekStartDate, 'yyyy-MM-dd');
        const endDateStr = format(addDays(weekStartDate, 6), 'yyyy-MM-dd');
        
        // Single API call returns bookings, busy times, and room IDs
        const { data, error } = await supabase.functions.invoke('public-availability', {
          body: { startDate: startDateStr, endDate: endDateStr },
        });

        if (error) throw error;
        
        // Bookings come pre-organized by date from the API
        if (data?.bookings) {
          setWeekBookings(data.bookings);
        }
        // #region agent log
        debugLog('BookingWizard.tsx:fetchWeekAvailability', 'Availability fetched', {
          startDate: startDateStr,
          endDate: endDateStr,
          bookingCount: Object.keys(data?.bookings || {}).reduce((s, d) => s + (data?.bookings?.[d]?.length || 0), 0),
          busyKeys: Object.keys(data?.busyTimes || {}),
        });
        // #endregion
        // Organize busy times by date — expand multi-day/all-day events across each date they cover
        const busyByDate: { [dateStr: string]: { [key: string]: BusyTime[] } } = {};
        if (data?.busyTimes) {
          Object.entries(data.busyTimes as { [key: string]: BusyTime[] }).forEach(([key, times]) => {
            times.forEach(busy => {
              const isAllDay = !busy.start.includes('T');
              
              if (isAllDay) {
                // All-day events use date-only strings like "2026-03-03"
                // end date is exclusive in Google Calendar (e.g., end "2026-03-08" means through Mar 7)
                const startParts = busy.start.split('-').map(Number);
                const endParts = busy.end.split('-').map(Number);
                const eventStart = new Date(startParts[0], startParts[1] - 1, startParts[2]);
                const eventEnd = new Date(endParts[0], endParts[1] - 1, endParts[2]); // exclusive
                
                // Add a full-day busy entry for each date in the range
                const cursor = new Date(eventStart);
                while (cursor < eventEnd) {
                  const dateStr = format(cursor, 'yyyy-MM-dd');
                  if (!busyByDate[dateStr]) busyByDate[dateStr] = {};
                  if (!busyByDate[dateStr][key]) busyByDate[dateStr][key] = [];
                  // Block entire day: 00:00 to 23:59 Hawaii time (HST = UTC-10)
                  const nextDay = new Date(cursor);
                  nextDay.setDate(nextDay.getDate() + 1);
                  const nextDayStr = format(nextDay, 'yyyy-MM-dd');
                  busyByDate[dateStr][key].push({
                    start: `${dateStr}T10:00:00.000Z`, // 00:00 HST = 10:00 UTC
                    end: `${nextDayStr}T09:59:00.000Z`, // 23:59 HST = next day 09:59 UTC
                  });
                  cursor.setDate(cursor.getDate() + 1);
                }
              } else {
                // Timed events — bucket by Hawaii date of start
                const busyStartUTC = parseISO(busy.start);
                const busyEndUTC = parseISO(busy.end);
                const busyStartHawaii = toZonedTime(busyStartUTC, BUSINESS_TIMEZONE);
                const busyEndHawaii = toZonedTime(busyEndUTC, BUSINESS_TIMEZONE);
                const startDateStr2 = format(busyStartHawaii, 'yyyy-MM-dd');
                const endDateStr2 = format(busyEndHawaii, 'yyyy-MM-dd');
                
                // If timed event spans midnight (different start/end dates), add to both
                const addToBucket = (dStr: string) => {
                  if (!busyByDate[dStr]) busyByDate[dStr] = {};
                  if (!busyByDate[dStr][key]) busyByDate[dStr][key] = [];
                  busyByDate[dStr][key].push(busy);
                };
                
                addToBucket(startDateStr2);
                if (endDateStr2 !== startDateStr2) {
                  addToBucket(endDateStr2);
                }
              }
            });
          });
        }
        setWeekBusyTimes(busyByDate);
      } catch (err) {
        console.error('Error fetching week availability:', err);
        // CRITICAL: On error, ensure busy times are EMPTY (not stale)
        // This prevents showing slots that might be blocked
        setWeekBookings({});
        setWeekBusyTimes({});
      } finally {
        setLoadingAvailability(false);
      }
    };

    fetchWeekAvailability();
  }, [weekStartDate]);

  // Check if a time slot conflicts for a specific date and practitioner
  const isTimeSlotConflictedForDateAndPractitioner = useCallback((date: Date, timeSlot: string, practitionerId: string): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const [slotHour, slotMin] = timeSlot.split(':').map(Number);
    const slotStartMinutes = slotHour * 60 + slotMin;
    const slotEndMinutes = slotStartMinutes + service.duration;

    // Skip room availability check — matches admin: show all practitioner schedule slots.
    // Room assignment and validation happen server-side on submit.

    // Check against existing bookings for this date and practitioner
    const dateBookings = weekBookings[dateStr] || [];
    const hasBookingConflict = dateBookings.some(booking => {
      if (booking.practitioner_id !== practitionerId) return false;
      
      const [bookingStartHour, bookingStartMin] = booking.start_time.split(':').map(Number);
      const [bookingEndHour, bookingEndMin] = booking.end_time.split(':').map(Number);
      const bookingStart = bookingStartHour * 60 + bookingStartMin;
      const bookingEnd = bookingEndHour * 60 + bookingEndMin;

      return slotStartMinutes < bookingEnd && slotEndMinutes > bookingStart;
    });

    if (hasBookingConflict) return true;

    // Skip practitioner Google Calendar busy check — server validates on submit (submit-booking).
    // Public-availability calendar data can be stale/cached and over-block; admin shows all slots
    // and validates on create. Aligning public with admin: show slots from schedule + internal
    // bookings only; calendar conflicts are caught server-side.
    return false;
  }, [weekBookings, service.duration]);

  // Get available time slots for a specific date
  const getAvailableSlotsForDate = useCallback((date: Date): string[] => {
    const dayOfWeek = DAY_MAP[date.getDay()];
    if (!availableDays.includes(dayOfWeek)) return [];
    
    const practitionersToCheck = selectedPractitioner 
      ? [selectedPractitioner] 
      : availablePractitioners;
    
    const allSlots: string[] = [];
    
    practitionersToCheck.forEach(practitioner => {
      const dayAvailability = practitioner.availability[dayOfWeek];
      if (!dayAvailability || dayAvailability.length === 0) return;
      
      dayAvailability.forEach(slot => {
        const startHour = parseInt(slot.start.split(':')[0]);
        const endHour = parseInt(slot.end.split(':')[0]);
        const startFromHour = parseInt(startFrom.split(':')[0]);
        const finishByHour = parseInt(finishBy.split(':')[0]);
        
        for (let hour = Math.max(startHour, startFromHour); hour < Math.min(endHour, finishByHour); hour++) {
          // Generate 15-minute interval slots
          for (let min = 0; min < 60; min += 15) {
            const totalMin = hour * 60 + min;
            const endTotalMin = parseInt(slot.end.split(':')[0]) * 60 + parseInt(slot.end.split(':')[1] || '0');
            const startTotalMin = parseInt(slot.start.split(':')[0]) * 60 + parseInt(slot.start.split(':')[1] || '0');
            const filterStartMin = parseInt(startFrom.split(':')[0]) * 60;
            const filterEndMin = parseInt(finishBy.split(':')[0]) * 60;

            if (totalMin < startTotalMin || totalMin >= endTotalMin) continue;
            if (totalMin < filterStartMin || totalMin >= filterEndMin) continue;

            const timeSlot = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const isAvailable = selectedPractitioner 
              ? !isTimeSlotConflictedForDateAndPractitioner(date, timeSlot, practitioner.id)
              : availablePractitioners.some(p => {
                  // When checking "Any Available", verify this practitioner actually has
                  // schedule blocks covering this time slot — not just absence of conflicts
                  const pDayAvail = p.availability[dayOfWeek];
                  if (!pDayAvail || pDayAvail.length === 0) return false;
                  const slotMin = parseInt(timeSlot.split(':')[0]) * 60 + parseInt(timeSlot.split(':')[1]);
                  const slotEndMin = slotMin + service.duration;
                  const hasSchedule = pDayAvail.some(s => {
                    const sStart = parseInt(s.start.split(':')[0]) * 60 + parseInt(s.start.split(':')[1] || '0');
                    const sEnd = parseInt(s.end.split(':')[0]) * 60 + parseInt(s.end.split(':')[1] || '0');
                    return slotMin >= sStart && slotEndMin <= sEnd;
                  });
                  if (!hasSchedule) return false;
                  return !isTimeSlotConflictedForDateAndPractitioner(date, timeSlot, p.id);
                });
            
            if (!allSlots.includes(timeSlot) && isAvailable) {
              allSlots.push(timeSlot);
            }
          }
        }
      });
    });

    // #region agent log
    debugLog('BookingWizard.tsx:getAvailableSlotsForDate', 'Slots computed for date', {
      dateStr: format(date, 'yyyy-MM-dd'),
      dayOfWeek,
      practitionerCount: practitionersToCheck.length,
      slotCount: allSlots.length,
      slots: allSlots.slice(0, 10),
      serviceName: service.name,
    });
    // #endregion
    return allSlots.sort();
  }, [availableDays, selectedPractitioner, availablePractitioners, startFrom, finishBy, isTimeSlotConflictedForDateAndPractitioner]);

  // Check if a date has available slots — considers BOTH schedule blocks AND busy times
  // This ensures days where all practitioners are blocked by Google Calendar show as unavailable
  const isDateAvailable = useCallback((date: Date) => {
    const dayOfWeek = DAY_MAP[date.getDay()];
    if (!availableDays.includes(dayOfWeek)) return false;
    
    // Actually compute slots to account for busy times blocking entire days
    return getAvailableSlotsForDate(date).length > 0;
  }, [availableDays, getAvailableSlotsForDate]);

  // Handle week navigation
  const handleNavigateWeek = useCallback((direction: 'prev' | 'next') => {
    const today = startOfDay(new Date());
    if (direction === 'prev') {
      const newStart = addDays(weekStartDate, -7);
      // Don't go before today
      setWeekStartDate(newStart < today ? today : newStart);
    } else {
      setWeekStartDate(addDays(weekStartDate, 7));
    }
    // Clear selection when navigating
    setSelectedDate(undefined);
    setSelectedTime('');
  }, [weekStartDate]);

  // Handle date and time selection from week view
  const handleSelectDateTime = useCallback((date: Date, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
  }, []);

  const toggleDay = (day: DayOfWeek) => {
    setAvailableDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day)
        : [...prev, day]
    );
  };

  const toggleExtra = (extraId: string) => {
    setSelectedExtras(prev =>
      prev.includes(extraId)
        ? prev.filter(id => id !== extraId)
        : [...prev, extraId]
    );
  };

  const calculateTotal = () => {
    const extrasTotal = selectedExtras.reduce((sum, extraId) => {
      const extra = EXTRAS.find(e => e.id === extraId);
      return sum + (extra?.price || 0);
    }, 0);
    return service.price + extrasTotal - couponDiscount;
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    const code = couponCode.trim().toUpperCase();
    
    if (code !== 'NEWMEMBER') {
      setCouponError('Invalid coupon code.');
      setCouponApplied(false);
      setCouponDiscount(0);
      return;
    }

    // Check if biomat is in selected extras
    const hasBiomat = selectedExtras.includes('amethyst-biomat');
    if (!hasBiomat) {
      setCouponError('This coupon requires the Amethyst Biomat add-on. Please go back and add it.');
      setCouponApplied(false);
      setCouponDiscount(0);
      return;
    }

    // Check if already redeemed by this email
    if (clientDetails.email) {
      const { data: existing } = await supabase
        .from('coupon_redemptions')
        .select('id')
        .eq('coupon_code', 'NEWMEMBER')
        .eq('customer_email', clientDetails.email.toLowerCase().trim())
        .maybeSingle();

      if (existing) {
        setCouponError('This coupon has already been used with your email.');
        setCouponApplied(false);
        setCouponDiscount(0);
        return;
      }
    }

    const biomatExtra = EXTRAS.find(e => e.id === 'amethyst-biomat');
    setCouponDiscount(biomatExtra?.price || 15);
    setCouponApplied(true);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return availablePractitioners.length > 0; // Must have at least one eligible practitioner
      case 2: return selectedDate && selectedTime; // Time step
      case 3: return true; // Extras are optional
      case 4: {
        const locationValid = !service.isOutcall || (clientDetails.location && clientDetails.location.trim().length >= 10);
        const baseValid = clientDetails.name && clientDetails.email && clientDetails.phone && locationValid;
        // For insurance services, require insurance fields
        if (isInsuranceService) {
          return baseValid && 
            insuranceInfo.provider && 
            insuranceInfo.policyNumber && 
            insuranceInfo.memberId && 
            insuranceInfo.subscriberName &&
            insuranceInfo.subscriberDob;
        }
        return baseValid;
      }
      case 5: return true;
      default: return false;
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Calculate end time based on service duration
      const [hours, mins] = selectedTime.split(':').map(Number);
      const startMinutes = hours * 60 + mins;
      const endMinutes = startMinutes + service.duration;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;

      // Get extra names for notes
      const selectedExtraNames = selectedExtras.map(extraId => {
        const extra = EXTRAS.find(e => e.id === extraId);
        return extra?.name || extraId;
      });

      const response = await supabase.functions.invoke('submit-booking', {
        body: {
          clientName: clientDetails.name,
          clientEmail: clientDetails.email,
          clientPhone: clientDetails.phone,
          practitionerId: selectedPractitioner?.id || null,
          practitioner2Id: isCouplesMassage ? selectedPractitioner2?.id : null,
          serviceId: service.id,
          serviceName: service.name,
          bookingDate: format(selectedDate!, 'yyyy-MM-dd'),
          startTime: selectedTime,
          endTime: endTime,
          notes: clientDetails.notes,
          totalAmount: calculateTotal(),
          extras: selectedExtraNames,
          isOutcall: service.isOutcall === true,
          location: service.isOutcall ? clientDetails.location : undefined,
          // Insurance information
          isInsuranceBooking: isInsuranceService,
          insuranceProvider: isInsuranceService ? insuranceInfo.provider : undefined,
          insurancePolicyNumber: isInsuranceService ? insuranceInfo.policyNumber : undefined,
          insuranceGroupNumber: isInsuranceService ? insuranceInfo.groupNumber : undefined,
          insuranceMemberId: isInsuranceService ? insuranceInfo.memberId : undefined,
          insuranceSubscriberName: isInsuranceService ? insuranceInfo.subscriberName : undefined,
          insuranceSubscriberDob: isInsuranceService ? insuranceInfo.subscriberDob : undefined,
          consentEmail,
          consentSms,
          couponCode: couponApplied ? 'NEWMEMBER' : undefined,
          couponDiscount: couponApplied ? couponDiscount : undefined,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to submit booking');
      }

      const bookingId = response.data?.booking?.id;
      const depositToken = response.data?.depositToken;
      const totalAmount = calculateTotal();
      const depositAmount = service.depositRequired;

      // Record coupon redemption if applied
      if (couponApplied && bookingId && clientDetails.email) {
        const { error } = await supabase.from('coupon_redemptions').insert({
          coupon_code: 'NEWMEMBER',
          customer_email: clientDetails.email.toLowerCase().trim(),
          customer_phone: clientDetails.phone || null,
          booking_id: bookingId,
        });
        if (error) console.error('Failed to record coupon redemption:', error);
        else debugLog('BookingWizard.tsx:coupon_redemptions.insert', 'Coupon redemption saved', { booking_id: bookingId });
      }

      // If deposit is required, redirect to Stripe checkout
      if (depositAmount > 0 && bookingId) {
        if (!depositToken) {
          throw new Error('Booking created but payment token missing. Please contact support.');
        }
        setPaymentRedirecting(true);
        
        const paymentResponse = await supabase.functions.invoke('create-deposit-payment', {
          body: {
            bookingId,
            depositToken,
            clientEmail: clientDetails.email,
            clientName: clientDetails.name,
            bookingDate: format(selectedDate!, 'MMMM d, yyyy'),
            startTime: formatTime(selectedTime),
          },
        });

        if (paymentResponse.error) {
          throw new Error(paymentResponse.error.message || 'Failed to create payment session');
        }

        if (paymentResponse.data?.url) {
          safeRedirect(paymentResponse.data.url);
          return;
        }
      }

      // Identify client in Klaviyo (client-side) for SMS flow targeting
      const nameParts = clientDetails.name.split(' ');
      klaviyoIdentify({
        $email: clientDetails.email,
        $first_name: nameParts[0] || '',
        $last_name: nameParts.slice(1).join(' ') || '',
        $phone_number: clientDetails.phone || undefined,
      });

      // Track booking event client-side (server-side also tracks as backup)
      klaviyoTrack('Booking Submitted', {
        ServiceName: service.name,
        BookingDate: format(selectedDate!, 'yyyy-MM-dd'),
        StartTime: selectedTime,
        TotalAmount: calculateTotal(),
        PractitionerName: selectedPractitioner?.name || 'Any Available',
      });

      onComplete({
        service,
        practitioner: selectedPractitioner,
        practitioner2: isCouplesMassage ? selectedPractitioner2 : undefined,
        date: selectedDate!,
        time: selectedTime,
        extras: selectedExtras,
        clientName: clientDetails.name,
        clientEmail: clientDetails.email,
        clientPhone: clientDetails.phone,
        notes: clientDetails.notes,
      });
    } catch (error) {
      console.error('Booking submission error:', error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to submit booking. Please try again.');
      setPaymentRedirecting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                currentStep > step.id 
                  ? "bg-sage text-white" 
                  : currentStep === step.id 
                    ? "bg-sage text-white" 
                    : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span className={cn(
                "ml-2 text-sm hidden sm:inline",
                currentStep >= step.id ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {step.label}
              </span>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "w-8 sm:w-16 h-1 mx-2 rounded",
                  currentStep > step.id ? "bg-sage" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-card rounded-xl shadow-soft border border-border/50 p-6 mb-6">
        {/* Step 1: Service Confirmation */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-semibold">Confirm Your Service</h2>
            
            <div className="flex gap-6 flex-col sm:flex-row">
              <img 
                src={service.image} 
                alt={service.name}
                className="w-full sm:w-48 h-48 object-cover rounded-lg"
              />
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">{service.name}</h3>
                <p className="text-muted-foreground mb-4">{service.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {service.duration} min
                  </Badge>
                </div>
                <div className="mt-4">
                  {isInsuranceService ? (
                    <>
                      <span className="text-2xl font-bold">Varies</span>
                      <p className="text-sm text-muted-foreground">Price depends on copay</p>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold">${service.price.toFixed(2)}</span>
                      <p className="text-sm text-muted-foreground">${service.depositRequired.toFixed(2)} deposit required</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Practitioner Selection */}
            {availablePractitioners.length === 0 && !loadingPractitioners && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
                <p className="text-sm font-medium text-destructive">No practitioners are currently available for this service.</p>
                <p className="text-xs text-muted-foreground mt-1">Please check back later or contact us for assistance.</p>
              </div>
            )}
            {isCouplesMassage ? (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 mb-2">
                  <p className="text-sm text-muted-foreground">
                    This is a couples massage. Please select practitioners for both guests.
                  </p>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* First Practitioner */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Guest 1 Practitioner
                    </Label>
                    <Select 
                      value={selectedPractitioner?.id || 'any'} 
                      onValueChange={(value) => {
                        const practitioner = value === 'any' ? null : availablePractitioners.find(p => p.id === value) || null;
                        setSelectedPractitioner(practitioner);
                        // If same practitioner selected for both, clear the second one
                        if (practitioner && selectedPractitioner2?.id === practitioner.id) {
                          setSelectedPractitioner2(null);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any Available" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Available</SelectItem>
                        {availablePractitioners.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              {p.image && (
                                <img src={p.image} alt={p.name} className="w-6 h-6 rounded-full object-cover" />
                              )}
                              {p.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Second Practitioner */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Guest 2 Practitioner
                    </Label>
                    <Select 
                      value={selectedPractitioner2?.id || 'any'} 
                      onValueChange={(value) => {
                        const practitioner = value === 'any' ? null : availablePractitioners.find(p => p.id === value) || null;
                        setSelectedPractitioner2(practitioner);
                        // If same practitioner selected for both, clear the first one
                        if (practitioner && selectedPractitioner?.id === practitioner.id) {
                          setSelectedPractitioner(null);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Any Available" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any Available</SelectItem>
                        {availablePractitioners
                          .filter(p => p.id !== selectedPractitioner?.id) // Exclude first practitioner from options
                          .map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              <div className="flex items-center gap-2">
                                {p.image && (
                                  <img src={p.image} alt={p.name} className="w-6 h-6 rounded-full object-cover" />
                                )}
                                {p.name}
                              </div>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Label>Select Practitioner (Optional)</Label>
                <Select 
                  value={selectedPractitioner?.id || 'any'} 
                  onValueChange={(value) => {
                    setSelectedPractitioner(value === 'any' ? null : availablePractitioners.find(p => p.id === value) || null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any Available" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any Available</SelectItem>
                    {availablePractitioners.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          {p.image && (
                            <img src={p.image} alt={p.name} className="w-6 h-6 rounded-full object-cover" />
                          )}
                          {p.name}{!isInsuranceService && ` ($${service.price.toFixed(2)})`}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Extras */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-semibold">Add Extras (Optional)</h2>
            <p className="text-muted-foreground">Enhance your experience with these add-ons</p>
            
            <div className="space-y-3">
              {EXTRAS.map(extra => (
                <div 
                  key={extra.id}
                  onClick={() => toggleExtra(extra.id)}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border p-3 cursor-pointer transition-all",
                    selectedExtras.includes(extra.id) 
                      ? "border-sage bg-sage/5 ring-2 ring-sage/20" 
                      : "border-border hover:border-sage/50"
                  )}
                >
                  <img 
                    src={extra.image} 
                    alt={extra.name}
                    className="w-[60px] h-[60px] rounded-lg object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{extra.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{extra.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="font-semibold text-sage">+${extra.price}</span>
                    <Checkbox 
                      checked={selectedExtras.includes(extra.id)}
                      onCheckedChange={() => toggleExtra(extra.id)}
                      className="border-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-semibold">Select Date & Time</h2>
            
            <p className="text-sm text-muted-foreground">
              Browse available appointment times below. Select a starting date to view a week of availability, then choose your preferred time slot.
            </p>

            {/* Quick Filters */}
            <div className="space-y-4">
              {/* Day Preferences */}
              <div className="space-y-2">
                <Label className="text-sm">Filter by Day</Label>
                <div className="flex flex-wrap gap-2">
                  {(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as DayOfWeek[]).map(day => (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={availableDays.includes(day) ? "default" : "outline"}
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "h-8",
                        availableDays.includes(day) && "bg-sage hover:bg-sage-dark"
                      )}
                    >
                      {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Time Range and Start Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Start Date Picker */}
                <div className="space-y-2">
                  <Label className="text-sm">Starting From</Label>
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal h-10"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(weekStartDate, "MMM d, yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={weekStartDate}
                        onSelect={(date) => {
                          if (date) {
                            setWeekStartDate(startOfDay(date));
                            setSelectedDate(undefined);
                            setSelectedTime('');
                          }
                          setCalendarOpen(false);
                        }}
                        disabled={(date) => {
                          const today = startOfDay(new Date());
                          return date < today;
                        }}
                        autoFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Range */}
                <div className="space-y-2">
                  <Label className="text-sm">Earliest Time</Label>
                  <Select value={startFrom} onValueChange={setStartFrom}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 7).map(hour => (
                        <SelectItem key={hour} value={`${hour.toString().padStart(2, '0')}:00`}>
                          {formatTime(`${hour.toString().padStart(2, '0')}:00`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Latest Time</Label>
                  <Select value={finishBy} onValueChange={setFinishBy}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 10).map(hour => (
                        <SelectItem key={hour} value={`${hour.toString().padStart(2, '0')}:00`}>
                          {formatTime(`${hour.toString().padStart(2, '0')}:00`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Week Availability View */}
            <WeekAvailabilityView
              startDate={weekStartDate}
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              onSelectDateTime={handleSelectDateTime}
              onNavigateWeek={handleNavigateWeek}
              getAvailableSlotsForDate={getAvailableSlotsForDate}
              isDateAvailable={isDateAvailable}
              loadingAvailability={loadingAvailability}
              formatTime={formatTime}
            />
          </div>
        )}

        {/* Step 4: Client Details */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-semibold">Your Details</h2>
            
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={clientDetails.name}
                  onChange={(e) => setClientDetails(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter your full name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={clientDetails.email}
                  onChange={(e) => setClientDetails(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="your@email.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={clientDetails.phone}
                  onChange={(e) => setClientDetails(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(808) 555-0123"
                />
              </div>
              
              {service.isOutcall && (
                <div className="space-y-3 p-4 bg-accent/30 rounded-lg border border-accent">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-accent text-accent-foreground border-accent">
                      Outcall Service
                    </Badge>
                    <span className="text-sm text-muted-foreground">We come to you!</span>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location Address *</Label>
                    <Textarea
                      id="location"
                      value={clientDetails.location}
                      onChange={(e) => setClientDetails(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="Enter the full street address, city, and zip code&#10;e.g., 123 Kalakaua Ave, Honolulu, HI 96815"
                      rows={3}
                    />
                    {clientDetails.location && clientDetails.location.length < 10 && (
                      <p className="text-xs text-destructive">
                        Please enter a complete address including street, city, and zip code
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Please provide the complete address where you'd like your massage. A 30-minute travel buffer is automatically added after your session.
                    </p>
                  </div>
                </div>
              )}

              {/* Insurance Information Section */}
              {isInsuranceService && (
                <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                      Insurance Booking
                    </Badge>
                    <span className="text-sm text-muted-foreground">Subject to insurance verification</span>
                  </div>
                  
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Please provide your insurance information below. Your appointment will be pending approval until we verify your insurance coverage.
                  </p>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {INSURANCE_DISCLAIMER}
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="insuranceProvider">Insurance Provider *</Label>
                      <Input
                        id="insuranceProvider"
                        value={insuranceInfo.provider}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, provider: e.target.value }))}
                        placeholder="e.g., HMSA, Kaiser Permanente, United Healthcare"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="insurancePolicyNumber">Policy Number *</Label>
                      <Input
                        id="insurancePolicyNumber"
                        value={insuranceInfo.policyNumber}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, policyNumber: e.target.value }))}
                        placeholder="Enter policy number"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="insuranceGroupNumber">Group Number</Label>
                      <Input
                        id="insuranceGroupNumber"
                        value={insuranceInfo.groupNumber}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, groupNumber: e.target.value }))}
                        placeholder="Enter group number (if applicable)"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="insuranceMemberId">Member/Subscriber ID *</Label>
                      <Input
                        id="insuranceMemberId"
                        value={insuranceInfo.memberId}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, memberId: e.target.value }))}
                        placeholder="Enter member ID from insurance card"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="insuranceSubscriberName">Subscriber Name *</Label>
                      <Input
                        id="insuranceSubscriberName"
                        value={insuranceInfo.subscriberName}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, subscriberName: e.target.value }))}
                        placeholder="Name on insurance policy"
                      />
                    </div>

                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="insuranceSubscriberDob">Subscriber Date of Birth *</Label>
                      <Input
                        id="insuranceSubscriberDob"
                        type="date"
                        value={insuranceInfo.subscriberDob}
                        onChange={(e) => setInsuranceInfo(prev => ({ ...prev, subscriberDob: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Required for insurance verification
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="notes">Special Requests or Notes</Label>
                <Textarea
                  id="notes"
                  value={clientDetails.notes}
                  onChange={(e) => setClientDetails(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any allergies, injuries, or preferences we should know about?"
                  rows={4}
                />
              </div>

              {/* Notification Consent */}
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg border border-border/50">
                <p className="text-sm font-medium">Communication Preferences</p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-email"
                    checked={consentEmail}
                    onCheckedChange={(checked) => setConsentEmail(checked === true)}
                  />
                  <Label htmlFor="consent-email" className="text-sm font-normal leading-snug cursor-pointer">
                    I agree to receive email notifications about my appointment (confirmations, reminders, and updates)
                  </Label>
                </div>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent-sms"
                    checked={consentSms}
                    onCheckedChange={(checked) => setConsentSms(checked === true)}
                  />
                  <div>
                    <Label htmlFor="consent-sms" className="text-sm font-normal leading-snug cursor-pointer">
                      I agree to receive text message (SMS) notifications about my appointment. Message & data rates may apply.
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 ml-0">
                      Text messages will not be sent during quiet hours (8 PM – 11 AM HST).
                    </p>
                  </div>
                </div>
              </div>

              {/* Klaviyo data is sent programmatically via klaviyoIdentify on submission */}
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-xl font-display font-semibold">Review Your Booking</h2>
            
            <div className="space-y-4">
              <div className="flex justify-between items-start py-3 border-b">
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.duration} minutes</p>
                </div>
                {!isInsuranceService && (
                  <span className="font-semibold">${service.price.toFixed(2)}</span>
                )}
              </div>
              
              {selectedExtras.length > 0 && !isInsuranceService && (
                <div className="space-y-2">
                  {selectedExtras.map(extraId => {
                    const extra = EXTRAS.find(e => e.id === extraId);
                    return extra ? (
                      <div key={extra.id} className="flex justify-between items-center py-2 text-sm">
                        <span>{extra.name}</span>
                        <span>+${extra.price.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              
              {!isInsuranceService && (
                <>
                  {couponApplied && (
                    <div className="flex justify-between items-center py-2 text-sm text-green-600">
                      <span>Coupon NEWMEMBER (Free Biomat)</span>
                      <span>-${couponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-3 border-t border-b font-semibold text-lg">
                    <span>Total</span>
                    <span>${calculateTotal().toFixed(2)}</span>
                  </div>
                  
                  {/* Coupon Code Input */}
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Have a coupon code?</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponCode}
                        onChange={(e) => {
                          setCouponCode(e.target.value.toUpperCase());
                          if (couponApplied) {
                            setCouponApplied(false);
                            setCouponDiscount(0);
                          }
                          setCouponError('');
                        }}
                        className="flex-1"
                        disabled={couponApplied}
                      />
                      <Button
                        type="button"
                        variant={couponApplied ? "outline" : "sage"}
                        size="sm"
                        onClick={couponApplied ? () => {
                          setCouponCode('');
                          setCouponApplied(false);
                          setCouponDiscount(0);
                          setCouponError('');
                        } : handleApplyCoupon}
                        disabled={!couponCode.trim() && !couponApplied}
                      >
                        {couponApplied ? 'Remove' : 'Apply'}
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-destructive">{couponError}</p>
                    )}
                    {couponApplied && (
                      <p className="text-xs text-green-600">✓ Coupon applied — Free Amethyst Biomat!</p>
                    )}
                  </div>
                </>
              )}
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Date & Time</p>
                  <p className="font-medium">
                    {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
                    <br />
                    {formatTime(selectedTime)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {isCouplesMassage ? 'Practitioners' : 'Practitioner'}
                  </p>
                  {isCouplesMassage ? (
                    <div className="space-y-1">
                      <p className="font-medium">
                        Guest 1: {selectedPractitioner?.name || 'Any Available'}
                      </p>
                      <p className="font-medium">
                        Guest 2: {selectedPractitioner2?.name || 'Any Available'}
                      </p>
                    </div>
                  ) : (
                    <p className="font-medium">{selectedPractitioner?.name || 'Any Available'}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Name</p>
                  <p className="font-medium">{clientDetails.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Contact</p>
                  <p className="font-medium">{clientDetails.email}</p>
                  <p className="font-medium">{clientDetails.phone}</p>
                </div>
              </div>
              
              {service.isOutcall && clientDetails.location && (
                <div className="bg-accent/10 rounded-lg p-3 border border-accent/30">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-accent/20 text-accent-foreground border-accent/40 text-xs">
                      Outcall
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{clientDetails.location}</p>
                  <p className="text-xs text-muted-foreground mt-1">30-minute travel buffer included after session</p>
                </div>
              )}
              
              {clientDetails.notes && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p>{clientDetails.notes}</p>
                </div>
              )}

              {/* Insurance Information in Review */}
              {isInsuranceService && (
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-4 text-sm border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                      Insurance Booking
                    </Badge>
                    <span className="text-amber-700 dark:text-amber-300 text-xs">Pending insurance verification</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground">Provider</p>
                      <p className="font-medium">{insuranceInfo.provider}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Policy Number</p>
                      <p className="font-medium">{insuranceInfo.policyNumber}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Member ID</p>
                      <p className="font-medium">{insuranceInfo.memberId}</p>
                    </div>
                    {insuranceInfo.groupNumber && (
                      <div>
                        <p className="text-muted-foreground">Group Number</p>
                        <p className="font-medium">{insuranceInfo.groupNumber}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Subscriber</p>
                      <p className="font-medium">{insuranceInfo.subscriberName}</p>
                    </div>
                  </div>
                  <p className="text-amber-700 dark:text-amber-300 mt-3 text-xs">
                    Your appointment will be confirmed once we verify your insurance coverage.
                  </p>
                </div>
              )}
              
              {!isInsuranceService && (
                <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                  <p className="font-medium">Deposit Required: ${service.depositRequired.toFixed(2)}</p>
                  <p className="text-muted-foreground">
                    Your deposit will be charged once your appointment is approved by the practitioner.
                  </p>
                  <p className="text-muted-foreground">
                    The remaining balance of ${(calculateTotal() - service.depositRequired).toFixed(2)} will be charged when you check in for your appointment.
                  </p>
                </div>
              )}

              {submitError && (
                <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
                  {submitError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => currentStep === 1 ? onBack() : setCurrentStep(prev => prev - 1)}
          disabled={isSubmitting}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          {currentStep === 1 ? 'Back to Services' : 'Previous'}
        </Button>
        
        {currentStep < 5 ? (
          <div className="flex gap-2">
            {currentStep === 3 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedExtras([]);
                  setCurrentStep(prev => prev + 1);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                Skip
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            <Button
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={!canProceed()}
              className="bg-sage hover:bg-sage-dark text-white"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleComplete}
            disabled={isSubmitting || paymentRedirecting}
            className="bg-sage hover:bg-sage-dark text-white"
          >
            {paymentRedirecting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Redirecting to Payment...
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : !isInsuranceService && service.depositRequired > 0 ? (
              <>
                Pay Deposit (${service.depositRequired.toFixed(2)})
                <Check className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>
                Confirm Booking
                <Check className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

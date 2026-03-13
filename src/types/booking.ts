export interface Practitioner {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialties: string[];
  color: string;
  avatar?: string;
  bio?: string;
  image?: string;
  availability: WeeklyAvailability;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  capacity: number;
  amenities: string[];
  color: string;
  isActive?: boolean;
}

export interface WeeklyAvailability {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
  saturday: TimeSlot[];
  sunday: TimeSlot[];
}

export interface TimeSlot {
  start: string; // HH:mm format
  end: string;
}

export interface Booking {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  practitionerId: string;
  practitioner2Id?: string | null; // For couples massage
  roomId: string;
  serviceType: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: 'confirmed' | 'pending' | 'pending_approval' | 'cancelled' | 'completed';
  notes?: string;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  duration: number; // in minutes
  price: number;
  description: string;
  category: string;
  practitionerIds?: string[];
  is_couples?: boolean;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

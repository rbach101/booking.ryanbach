import { Service, Practitioner } from '@/types/booking';
import yogaImage from '@/assets/services/yoga.jpg';

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
}

export interface DurationOption {
  id: string;
  duration: number;
  price: number;
  depositRequired: number;
  description?: string;
}

export interface FullService extends Service {
  image: string;
  depositRequired: number;
  practitionerIds: string[];
  isOutcall?: boolean;
  isCouples?: boolean;
  isLocal?: boolean;
  durationOptions?: DurationOption[];
}

export interface ServiceGroup {
  id: string;
  name: string;
  baseDescription: string;
  category: string;
  image: string;
  practitionerIds: string[];
  isOutcall?: boolean;
  isCouples?: boolean;
  isLocal?: boolean;
  durations: DurationOption[];
}

export const serviceCategories: ServiceCategory[] = [
  { id: 'massage', name: 'Massage', description: 'Therapeutic and relaxation massage services' },
  { id: 'kamaaina', name: "Kama'aina", description: 'Special rates for Hawaii residents with ID' },
  { id: 'outcall', name: 'Outcall', description: 'Mobile massage services at your location' },
  { id: 'couples', name: "Couple's", description: 'Side-by-side massage experiences for two' },
  { id: 'thai', name: 'Thai Massage', description: 'Traditional Thai mat massage techniques' },
  { id: 'specialty', name: 'Specialty', description: 'Energy healing and specialized treatments' },
  { id: 'insurance', name: 'Insurance', description: 'Massage covered by insurance' },
  { id: 'yoga', name: 'Yoga', description: 'Yoga classes and instruction' },
];

/** Disclaimer shown for all insurance massage services and bookings */
export const INSURANCE_DISCLAIMER =
  'Most insurance does not cover the full cost of the service. You will be required to cover the remainder of what your insurance does not cover at time of service.';

// Database practitioner UUIDs
const PRACTITIONER_IDS = {
  alea: '2e7a1bda-4562-477c-a53b-043307f7eaee',
  tilssa: 'd66ba2df-af98-4d15-8834-516be7334191',
  sarah: 'ba567553-b0e2-4d2d-81a1-942e92e950a8',
  kyle: '76fb588c-1f3d-4942-9f8a-c37483f9140c',
  jaylynn: '37f16d1e-38be-4ed2-a290-78fe95923210',
  nicole: 'eb483e4d-6d77-4029-a3e5-b31fba4d8fc7',
  tionna: '330d4b9c-ba22-405f-b003-25fed1483303',
};

const ALL_PRACTITIONER_IDS = Object.values(PRACTITIONER_IDS);

// Grouped services with duration options
export const serviceGroups: ServiceGroup[] = [
  // Standard Massage
  {
    id: 'massage-standard',
    name: 'Massage',
    baseDescription: 'Therapeutic or deep tissue session in our studio.',
    category: 'massage',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    durations: [
      { id: '93dc145b-2a14-4dba-8dec-b093c3e62df2', duration: 60, price: 160, depositRequired: 80 },
      { id: '0275a654-5ba8-42aa-adca-522560755822', duration: 75, price: 200, depositRequired: 100 },
      { id: '9227128a-d4d8-4aac-9008-c2a5194c00c1', duration: 90, price: 240, depositRequired: 120 },
    ],
  },
  // Kama'aina Massage
  {
    id: 'massage-kamaaina',
    name: "Kama'aina Massage",
    baseDescription: 'Special local rate massage - Hawaii ID required.',
    category: 'kamaaina',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    isLocal: true,
    durations: [
      { id: '07320b76-c74f-42be-82e7-f36bba3f406a', duration: 60, price: 140, depositRequired: 70 },
      { id: '8181dc33-cc74-4f13-aa55-440d7ac2da4f', duration: 75, price: 175, depositRequired: 87.5 },
      { id: 'aea2d7dc-2f4b-4f68-b1f6-fb407694440f', duration: 90, price: 210, depositRequired: 105 },
    ],
  },
  // Outcall Massage
  {
    id: 'massage-outcall',
    name: 'Massage Outcall',
    baseDescription: 'Professional massage brought to your location.',
    category: 'outcall',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    isOutcall: true,
    durations: [
      { id: '439d835e-4741-4746-8616-46680768fad6', duration: 60, price: 190, depositRequired: 95 },
      { id: '5a7766bd-45fb-4f31-89a0-e43e6c62956e', duration: 75, price: 217.5, depositRequired: 108.75 },
      { id: '10f4d188-a23b-49b9-9355-a969699917ed', duration: 90, price: 270, depositRequired: 135 },
    ],
  },
  // Kama'aina Outcall
  {
    id: 'massage-kamaaina-outcall',
    name: "Kama'aina Massage Outcall",
    baseDescription: 'Local rate outcall massage - Hawaii ID required.',
    category: 'kamaaina',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    isLocal: true,
    isOutcall: true,
    durations: [
      { id: '1ffc64aa-2e8f-4886-800f-38106bce77aa', duration: 60, price: 170, depositRequired: 85 },
      { id: '59e84ac9-4633-4287-bf4a-ea758862dc79', duration: 75, price: 195, depositRequired: 97.5 },
      { id: 'e35f5530-6aec-47f3-9750-5715b9ca92af', duration: 90, price: 240, depositRequired: 120 },
    ],
  },
  // Thai Massage In-Office
  {
    id: 'thai-massage',
    name: 'Thai Mat Massage',
    baseDescription: 'Traditional Thai massage on a floor mat.',
    category: 'thai',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: [PRACTITIONER_IDS.tilssa],
    durations: [
      { id: '8c513168-3244-4b16-8700-625991111ca1', duration: 60, price: 160, depositRequired: 80 },
      { id: '57667bee-60f5-4c56-881a-ee9aca2f5b9a', duration: 75, price: 200, depositRequired: 100 },
      { id: '3b28d871-5b3b-476b-b986-b9a1578a091d', duration: 90, price: 240, depositRequired: 120 },
    ],
  },
  // Thai Massage Outcall
  {
    id: 'thai-massage-outcall',
    name: 'Thai Mat Massage Outcall',
    baseDescription: 'Thai mat massage brought to your location.',
    category: 'thai',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: [PRACTITIONER_IDS.tilssa],
    isOutcall: true,
    durations: [
      { id: 'd9698897-e181-4b4a-82fb-51c50a69249c', duration: 60, price: 190, depositRequired: 95 },
      { id: 'b93e8e67-8be4-4ef7-83ff-43db519e64cb', duration: 75, price: 230, depositRequired: 115 },
      { id: '67e69fbd-e450-475b-8831-d936e0f984ab', duration: 90, price: 270, depositRequired: 135 },
    ],
  },
  // Couples Massage In-Office
  {
    id: 'couples-massage',
    name: "Couple's Massage",
    baseDescription: 'Side-by-side massage experience for two.',
    category: 'couples',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    isCouples: true,
    durations: [
      { id: '4eb0364d-78e6-4bb7-b9e7-ff055ee323c3', duration: 60, price: 300, depositRequired: 150 },
      { id: 'dc461eb7-85bc-4b63-8c35-346d0c88d385', duration: 75, price: 385, depositRequired: 192.5 },
      { id: '3009720b-51ef-4fe3-938e-85134a87b5d2', duration: 90, price: 460, depositRequired: 230 },
    ],
  },
  // Couples Massage Outcall
  {
    id: 'couples-massage-outcall',
    name: "Couple's Massage Outcall",
    baseDescription: 'Couples massage brought to your location.',
    category: 'couples',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: ALL_PRACTITIONER_IDS,
    isCouples: true,
    isOutcall: true,
    durations: [
      { id: 'b92fe2d6-e354-40d8-a9c6-3d677eba5a87', duration: 60, price: 360, depositRequired: 180 },
      { id: '3341b585-5926-40c0-80f7-5af10eae0c2a', duration: 75, price: 400, depositRequired: 200 },
      { id: '8d28a91c-ca11-4cad-9aab-9c4c8657c11b', duration: 90, price: 520, depositRequired: 260 },
    ],
  },
  // Energy Healing - single duration
  {
    id: 'energy-healing',
    name: 'Energy Healing',
    baseDescription: 'Reiki and energy balancing session for deep relaxation.',
    category: 'specialty',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: [PRACTITIONER_IDS.alea, PRACTITIONER_IDS.tilssa],
    durations: [
      { id: 'b57beec9-7b26-45f8-9435-0d9cb7c04d2b', duration: 60, price: 150, depositRequired: 75 },
    ],
  },
  // Insurance Massage - single duration
  {
    id: 'insurance-massage',
    name: 'Massage With Insurance',
    baseDescription: 'Therapeutic massage covered by insurance. Please verify coverage before booking. Most insurance does not cover the full cost — you will be required to cover the remainder at time of service.',
    category: 'insurance',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    practitionerIds: [PRACTITIONER_IDS.alea],
    durations: [
      { id: '68746112-0946-4e5a-a850-71cd336a0b44', duration: 60, price: 160, depositRequired: 0 },
    ],
  },
  // Group Yoga
  {
    id: 'yoga-group',
    name: 'Group Yoga Class',
    baseDescription: 'Yoga class with experienced instruction. Minimum of 6 people needed for class to be confirmed.',
    category: 'yoga',
    image: yogaImage,
    practitionerIds: [PRACTITIONER_IDS.alea],
    durations: [
      { id: '544f833e-0783-4b6e-bd46-ce6fab9a9858', duration: 60, price: 25, depositRequired: 25 },
    ],
  },
  // Private Yoga
  {
    id: 'yoga-private',
    name: 'Private Yoga Class',
    baseDescription: 'One-on-one private yoga session with personalized instruction tailored to your needs.',
    category: 'yoga',
    image: yogaImage,
    practitionerIds: [PRACTITIONER_IDS.alea],
    durations: [
      { id: 'fdf079e3-7fe3-4bcd-8dfb-3a40f7c0dd37', duration: 60, price: 150, depositRequired: 75 },
    ],
  },
];

// Convert serviceGroups to fullServices for backward compatibility
export const fullServices: FullService[] = serviceGroups.flatMap(group => 
  group.durations.map(dur => ({
    id: dur.id,
    name: group.durations.length > 1 
      ? `${dur.duration} Min ${group.name}` 
      : group.name,
    duration: dur.duration,
    price: dur.price,
    depositRequired: dur.depositRequired,
    description: dur.description || group.baseDescription,
    category: group.category,
    image: group.image,
    practitionerIds: group.practitionerIds,
    isOutcall: group.isOutcall,
    isCouples: group.isCouples,
    isLocal: group.isLocal,
  }))
);

export const practitioners: Practitioner[] = [
  {
    id: PRACTITIONER_IDS.alea,
    name: 'Alea Backus',
    email: 'aleaschechter@gmail.com',
    phone: '+1 808-358-9553',
    specialties: ['Yoga Instruction', 'Massage Therapy', 'Wellness Coaching'],
    color: 'hsl(150, 35%, 45%)',
    bio: 'Licensed massage therapist and RYT 200 yoga instructor with over 1,000 hours of teaching experience.',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    availability: {
      monday: [{ start: '07:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '07:00', end: '17:00' }],
      saturday: [{ start: '09:00', end: '14:00' }],
      sunday: [{ start: '07:00', end: '10:00' }],
    },
  },
  {
    id: PRACTITIONER_IDS.tilssa,
    name: 'Tilssa Stith',
    email: 'tilssa25@yahoo.com',
    phone: '+1 808-333-7049',
    specialties: ['Lomi Lomi', 'Shiatsu', 'Swedish', 'Sports', 'Thai', 'Deep Tissue', 'Lymphatic'],
    color: 'hsl(35, 45%, 50%)',
    bio: 'Over 10 years of experience in Lomi Lomi, Shiatsu, Swedish, Sports, Reflexology, Prenatal, Deep Tissue & Lymphatic Massage.',
    image: 'https://placehold.co/640x400/6b8f71/ffffff?text=Service',
    availability: {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '09:00', end: '17:00' }],
      saturday: [{ start: '10:00', end: '15:00' }],
      sunday: [],
    },
  },
  {
    id: PRACTITIONER_IDS.sarah,
    name: 'Sarah Kannon',
    email: 'Kannon1017@gmail.com',
    phone: '+1 808-464-5317',
    specialties: ['Massage Therapy', 'Relaxation', 'Deep Tissue'],
    color: 'hsl(280, 30%, 55%)',
    bio: 'Skilled massage therapist dedicated to helping clients achieve relaxation and pain relief.',
    image: '',
    availability: {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [{ start: '09:00', end: '17:00' }],
      friday: [{ start: '09:00', end: '17:00' }],
      saturday: [],
      sunday: [],
    },
  },
  {
    id: PRACTITIONER_IDS.kyle,
    name: 'Kyle Fife',
    email: 'surf501nl@gmail.com',
    phone: '+1 808-464-5724',
    specialties: ['Sports Massage', 'Deep Tissue', 'Therapeutic'],
    color: 'hsl(200, 50%, 45%)',
    bio: 'Experienced massage therapist specializing in sports and therapeutic massage.',
    image: '',
    availability: {
      monday: [{ start: '09:00', end: '17:00' }],
      tuesday: [{ start: '09:00', end: '17:00' }],
      wednesday: [{ start: '09:00', end: '17:00' }],
      thursday: [],
      friday: [{ start: '09:00', end: '17:00' }],
      saturday: [{ start: '10:00', end: '14:00' }],
      sunday: [],
    },
  },
  {
    id: PRACTITIONER_IDS.jaylynn,
    name: 'Jaylynn Jitchaku Waite',
    email: 'practitioner1@example.com',
    phone: '+1 808-555-0105',
    specialties: ['Swedish', 'Deep Tissue', 'Prenatal'],
    color: 'hsl(320, 40%, 50%)',
    bio: 'Certified prenatal massage specialist with a gentle, nurturing approach.',
    image: '',
    availability: {
      monday: [{ start: '10:00', end: '18:00' }],
      tuesday: [{ start: '10:00', end: '18:00' }],
      wednesday: [{ start: '10:00', end: '18:00' }],
      thursday: [{ start: '10:00', end: '18:00' }],
      friday: [],
      saturday: [{ start: '09:00', end: '15:00' }],
      sunday: [],
    },
  },
  {
    id: PRACTITIONER_IDS.nicole,
    name: 'Nicole Berinobis',
    email: 'practitioner2@example.com',
    phone: '+1 808-555-0106',
    specialties: ['Hot Stone', 'Aromatherapy', 'Relaxation'],
    color: 'hsl(45, 60%, 50%)',
    bio: 'Aromatherapy and hot stone massage expert creating deeply relaxing experiences.',
    image: '',
    availability: {
      monday: [],
      tuesday: [{ start: '11:00', end: '19:00' }],
      wednesday: [{ start: '11:00', end: '19:00' }],
      thursday: [{ start: '11:00', end: '19:00' }],
      friday: [{ start: '11:00', end: '19:00' }],
      saturday: [{ start: '10:00', end: '16:00' }],
      sunday: [{ start: '10:00', end: '14:00' }],
    },
  },
  {
    id: PRACTITIONER_IDS.tionna,
    name: 'Tionna Kuhnhoff',
    email: 'practitioner3@example.com',
    phone: '+1 808-555-0107',
    specialties: ['Therapeutic', 'Injury Recovery', 'Deep Tissue'],
    color: 'hsl(170, 45%, 45%)',
    bio: 'Former physical therapy assistant specializing in injury recovery and rehabilitation massage.',
    image: '',
    availability: {
      monday: [{ start: '08:00', end: '16:00' }],
      tuesday: [{ start: '08:00', end: '16:00' }],
      wednesday: [],
      thursday: [{ start: '08:00', end: '16:00' }],
      friday: [{ start: '08:00', end: '16:00' }],
      saturday: [],
      sunday: [{ start: '09:00', end: '13:00' }],
    },
  },
];

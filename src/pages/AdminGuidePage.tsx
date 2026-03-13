import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Calendar, Users, Clock, Bell, CreditCard, FileText, ClipboardList,
  UserPlus, MessageSquare, Shield, Settings, ChevronDown, ChevronRight,
  CheckCircle, ArrowRight, AlertTriangle, Leaf, Home, Search, Mail,
  Phone, DollarSign, UserCheck, BookOpen, Smartphone, Globe, Download, Printer
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  description: string;
  steps: FlowStep[];
  tips?: string[];
  warnings?: string[];
}

interface FlowStep {
  label: string;
  detail: string;
}

const flowSections: FlowSection[] = [
  {
    id: 'booking-flow',
    icon: <Globe className="w-5 h-5" />,
    title: 'Client Online Booking Flow',
    badge: 'Core Flow',
    description: 'How clients book appointments through the public booking page.',
    steps: [
      { label: 'Client visits booking page', detail: 'They can access it at booking.example.com/book or via the embedded widget on your website.' },
      { label: 'Select service & practitioner', detail: 'Client chooses from active services and available practitioners.' },
      { label: 'Pick date & time', detail: 'The system shows only available slots based on practitioner schedules, existing bookings, and Google Calendar busy times.' },
      { label: 'Add extras (add-ons)', detail: 'Client can optionally add extras like hot stones, cupping, essential oils, etc.' },
      { label: 'Enter contact info & consent', detail: 'Client fills in name, email, phone, and agrees to SMS/email consent.' },
      { label: 'Redirected to secure payment page', detail: 'After submitting, the client is redirected to a secure payment page where they enter their card details. Their card is saved for the deposit charge later — they are NOT charged yet at this step.' },
      { label: 'Booking created as pending', detail: 'Once the client completes the card capture, the booking is created as "pending" and the client sees a confirmation page.' },
      { label: 'Admin receives notification', detail: 'You get an email and in-app notification about the new booking request.' },
    ],
    tips: [
      'Share your booking page link on social media and your website.',
      'You can also embed the booking widget directly into an external website.',
      'The client\'s card is saved securely — no charge occurs until you approve the booking.',
    ],
  },
  {
    id: 'approval-flow',
    icon: <CheckCircle className="w-5 h-5" />,
    title: 'Booking Approval & Deposit Flow',
    badge: 'Core Flow',
    description: 'How to review, approve, and collect deposits for incoming bookings.',
    steps: [
      { label: 'Review pending bookings', detail: 'Go to Dashboard or Bookings page. Pending bookings appear in the "Pending Approvals" section.' },
      { label: 'Check for conflicts', detail: 'Verify the practitioner and room are available at the requested time on the Calendar page.' },
      { label: 'Approve or decline', detail: 'Click "Approve" to confirm, or "Decline" to reject. The client is notified by email either way.' },
      { label: 'Deposit is automatically charged', detail: 'When you approve, the system charges the deposit (typically 50% of the service price) to the card the client saved during booking. No action needed from the client.' },
      { label: 'Confirmation emails sent', detail: 'The client receives a confirmation email. The assigned practitioner also receives an email and in-app notification with the appointment details.' },
      { label: 'Booking syncs to Google Calendar', detail: 'If Google Calendar is connected, the appointment is created as an event on the practitioner\'s calendar.' },
    ],
    tips: [
      'You can also approve bookings directly from the notification bell.',
      'The deposit is charged automatically using the card the client entered at booking — no payment link is needed.',
      'Declined bookings notify the client and are removed from the calendar.',
    ],
    warnings: [
      'Always check room availability before approving couples massages (they require 2 practitioners and a room).',
      'If a client\'s saved card fails, you may need to send a manual payment link from the booking details.',
    ],
  },
  {
    id: 'manual-booking',
    icon: <Clock className="w-5 h-5" />,
    title: 'Creating Manual Bookings (Walk-ins / Phone)',
    badge: 'Staff',
    badgeVariant: 'secondary',
    description: 'How to create bookings for walk-in clients or phone reservations.',
    steps: [
      { label: 'Click "New Booking" on the Dashboard', detail: 'Opens the booking wizard with service, practitioner, room, and time selection.' },
      { label: 'Search for existing customer', detail: 'Type a name or email to auto-fill client details. Or enter new client info.' },
      { label: 'Select service, practitioner, room', detail: 'Choose from active services and check practitioner/room availability.' },
      { label: 'Pick date and time', detail: 'The system will warn you about conflicts or Google Calendar busy times.' },
      { label: 'Add notes', detail: 'Add any special requests, allergies, or preferences.' },
      { label: 'Choose payment & approval options', detail: 'Before submitting, you\'ll see two optional toggles: "Pay in Full" and "Auto Approve".' },
      { label: '"Pay in Full" option', detail: 'When enabled, the booking is marked as fully paid with no deposit or balance due. Use this for walk-ins who pay cash or card at the front desk. A manual payment note is added to the record.' },
      { label: '"Auto Approve" option', detail: 'When enabled, the booking is created directly as "confirmed" — skipping the pending approval step entirely. The appointment syncs to Google Calendar and notifications are sent immediately.' },
      { label: 'Submit', detail: 'The booking is created based on your selected options. If neither toggle is on, the booking is created as "pending" and follows the normal approval flow.' },
    ],
    tips: [
      'Use "Auto Approve" for walk-ins and phone bookings that don\'t need review.',
      'Use "Pay in Full" when the client pays at the time of booking (cash, card on-site, etc.).',
      'You can combine both toggles — e.g., a walk-in who pays cash can be marked as paid in full and auto-approved.',
      'If you don\'t toggle either option, the booking goes to the pending queue for manual approval.',
      'You can still send a payment link after creating the booking from the booking details dialog.',
    ],
  },
  {
    id: 'check-in',
    icon: <UserCheck className="w-5 h-5" />,
    title: 'Client Check-In Flow',
    description: 'How the client check-in process works on appointment day.',
    steps: [
      { label: 'Client arrives at the studio', detail: 'Direct them to the check-in page on the iPad/tablet at the front desk.' },
      { label: 'Client enters their name or email', detail: 'The system finds their appointment for today.' },
      { label: 'Client confirms check-in', detail: 'Their booking status updates to "checked-in".' },
      { label: 'Staff is notified', detail: 'The assigned practitioner and admin receive an in-app notification that the client has arrived.' },
    ],
    tips: [
      'Bookmark the check-in page on your front desk iPad or tablet.',
      'Check-in notifications appear in the bell icon and on the dashboard.',
    ],
  },
  {
    id: 'payments',
    icon: <DollarSign className="w-5 h-5" />,
    title: 'Payments & Balance Collection',
    description: 'How deposits, balance payments, and tips are handled.',
    steps: [
      { label: 'Card captured at booking', detail: 'When a client books online, they enter their card details on a secure payment page. The card is saved — no charge yet.' },
      { label: 'Deposit charged at approval', detail: 'When you approve the booking, the deposit (typically 50% of service price) is automatically charged to the client\'s saved card. No action needed from the client.' },
      { label: 'Balance due after appointment', detail: 'The remaining balance appears in the Dashboard "Balance Payments" section.' },
      { label: 'Automated balance collection', detail: '10 minutes after the appointment ends, the system automatically sends the client a text message with a link to pay their remaining balance.' },
      { label: 'Client pays balance + tip', detail: 'The payment page lets clients pay the remaining amount and optionally add a gratuity (15%, 20%, 25%, 30%, or custom).' },
      { label: 'Manual payment links', detail: 'You can also manually send a payment link from the booking details dialog if needed.' },
    ],
    tips: [
      'The "Balance Payments" widget on the admin dashboard shows all unpaid balances.',
      'Deposits are charged automatically using the saved card — the client doesn\'t need to do anything.',
      'The automated text with the balance link is sent 10 minutes after the appointment end time.',
      'Tips are added as a separate line item on the payment page.',
    ],
    warnings: [
      'If a client\'s saved card is declined, you\'ll need to send a manual payment link from the booking details.',
    ],
  },
  {
    id: 'calendar',
    icon: <Calendar className="w-5 h-5" />,
    title: 'Calendar Management',
    description: 'How to use the calendar to view and manage all appointments.',
    steps: [
      { label: 'Navigate to Calendar', detail: 'Click "Calendar" in the sidebar to see the week view.' },
      { label: 'Switch views', detail: 'Toggle between "By Practitioner" and "By Room" views at the top.' },
      { label: 'Click any booking', detail: 'Opens the booking details dialog with client info, service, status, and action buttons.' },
      { label: 'Google Calendar sync', detail: 'Connected practitioner calendars show busy times as gray blocks, preventing double-booking.' },
    ],
    tips: [
      'Use the date navigation arrows to move between weeks.',
      'Color-coded appointments match each practitioner\'s assigned color.',
      'Google Calendar busy times are refreshed automatically.',
    ],
  },
  {
    id: 'practitioners',
    icon: <Users className="w-5 h-5" />,
    title: 'Practitioner Management',
    badge: 'Admin Only',
    badgeVariant: 'outline',
    description: 'How to add, edit, and manage practitioner profiles and schedules.',
    steps: [
      { label: 'Go to Practitioners page', detail: 'Click "Practitioners" in the sidebar (admin only).' },
      { label: 'Add a practitioner', detail: 'Click "Add Practitioner" — enter name, email, specialties, bio, and assign a color.' },
      { label: 'Invite as staff user', detail: 'Click "Invite Staff" to send them a login invitation. They\'ll receive an email with a temporary password.' },
      { label: 'Set their schedule', detail: 'Click the calendar icon on their card to set weekly availability blocks (e.g., Mon 9 AM – 5 PM).' },
      { label: 'Connect Google Calendar', detail: 'Click the Google Calendar icon to link their personal calendar for busy time sync.' },
    ],
    tips: [
      'Each practitioner gets a unique color that shows on the calendar.',
      'Staff users can only see their own bookings; admins see everything.',
      'Deactivating a practitioner hides them from the booking page but preserves their data.',
    ],
    warnings: [
      'When inviting staff, they must change their temporary password on first login.',
      'Google Calendar connection requires the practitioner\'s Google account authorization.',
    ],
  },
  {
    id: 'customers',
    icon: <UserPlus className="w-5 h-5" />,
    title: 'Customer CRM',
    description: 'How to manage your customer database and history.',
    steps: [
      { label: 'Go to Customers page', detail: 'Click "Customers" in the sidebar.' },
      { label: 'Search & filter', detail: 'Use the search bar to find customers by name, email, or phone.' },
      { label: 'View customer details', detail: 'Click a customer to see their booking history, contact info, and notes.' },
      { label: 'Add tags', detail: 'Use tags to organize customers (e.g., "VIP", "Insurance", "Member").' },
      { label: 'Edit customer info', detail: 'Update contact details, add notes, or add addresses.' },
    ],
    tips: [
      'Customers are automatically created when they book online.',
      'The "Total Appointments" count updates automatically.',
      'Use notes to record preferences, allergies, or special requests.',
    ],
  },
  {
    id: 'intake-forms',
    icon: <ClipboardList className="w-5 h-5" />,
    title: 'Intake Forms',
    badge: 'Admin Only',
    badgeVariant: 'outline',
    description: 'How to create and manage client intake forms.',
    steps: [
      { label: 'Go to Intake Forms page', detail: 'Click "Intake Forms" in the sidebar (admin only).' },
      { label: 'Create a template', detail: 'Design intake form templates with custom fields (text, checkbox, dropdown, signature, etc.).' },
      { label: 'Assign to services', detail: 'Link templates to specific services so clients get the right form for their appointment.' },
      { label: 'Client fills out form', detail: 'Clients receive the intake form link before their appointment or can fill it out at check-in.' },
      { label: 'Review responses', detail: 'View completed forms in the Intake Forms page, linked to the booking and customer.' },
    ],
    tips: [
      'Mark forms as "required" to ensure clients complete them before their appointment.',
      'Intake forms include digital signature capture for consent.',
    ],
  },
  {
    id: 'soap-notes',
    icon: <FileText className="w-5 h-5" />,
    title: 'SOAP Notes',
    description: 'How practitioners document treatment sessions.',
    steps: [
      { label: 'Go to SOAP Notes page', detail: 'Click "SOAP Notes" in the sidebar.' },
      { label: 'Create a new note', detail: 'Click "New SOAP Note" — select the customer, booking, and session date.' },
      { label: 'Fill in the SOAP sections', detail: 'Document Subjective (client complaints), Objective (findings), Assessment (evaluation), Plan (follow-up).' },
      { label: 'Add treatment details', detail: 'Record areas treated, techniques used, pressure level, and duration.' },
      { label: 'Body annotations', detail: 'Use the body diagram to mark treatment areas visually.' },
    ],
    tips: [
      'SOAP notes are linked to specific customers and bookings for easy reference.',
      'Follow-up recommendations can be flagged for reminder purposes.',
      'This is HIPAA-compliant documentation.',
    ],
  },
  {
    id: 'waitlist',
    icon: <Clock className="w-5 h-5" />,
    title: 'Waitlist Management',
    description: 'How the waitlist works for clients who want appointments when none are available.',
    steps: [
      { label: 'Client requests waitlist spot', detail: 'If no slots are available, clients can join the waitlist specifying their preferred practitioner, service, date range, and time preferences.' },
      { label: 'View waitlist entries', detail: 'Go to the Waitlist page to see all active waitlist entries.' },
      { label: 'Notify when available', detail: 'When a slot opens up, click "Notify" to email the client about availability.' },
      { label: 'Convert to booking', detail: 'If the client responds, create a booking for them and mark the waitlist entry as booked.' },
    ],
    tips: [
      'Waitlist entries can have preferred days and time windows.',
      'Expired entries are automatically flagged.',
    ],
  },
  {
    id: 'memberships',
    icon: <CreditCard className="w-5 h-5" />,
    title: 'Memberships & Packages',
    badge: 'Admin Only',
    badgeVariant: 'outline',
    description: 'How to set up and manage membership plans and session packages.',
    steps: [
      { label: 'Go to Memberships page', detail: 'Click "Memberships" in the sidebar (admin only).' },
      { label: 'Create a membership plan', detail: 'Define name, price, billing period (monthly/annual), included sessions, and eligible services.' },
      { label: 'Create session packages', detail: 'Set up prepaid session bundles (e.g., "5 Massages for $500") with expiration.' },
      { label: 'Assign to customers', detail: 'Click "Add Member" on a plan or "Assign" on a package to link it to a specific customer. You can add manually or via Stripe checkout.' },
      { label: 'Track sessions remaining', detail: 'The "Active Members" tab shows all active memberships and packages with session counts.' },
      { label: 'Book using a session', detail: 'When creating a booking via the "New Booking" dialog, select a customer who has an active membership or package. A banner will appear showing their available sessions. Check "Use Session" to apply it — the booking will be created at $0 and the session count is decremented automatically.' },
    ],
    tips: [
      'Memberships support recurring billing via Stripe.',
      'Session packages can be restricted to specific services.',
      'When "Use Session" is toggled on, the deposit payment link option is hidden since no charge applies.',
      'Session usage is tracked in real-time — the banner shows remaining sessions before you apply one.',
    ],
  },
  {
    id: 'email',
    icon: <Mail className="w-5 h-5" />,
    title: 'Email Management',
    description: 'How to send emails and manage email templates.',
    steps: [
      { label: 'Go to Email page', detail: 'Click "Email" in the sidebar.' },
      { label: 'Compose an email', detail: 'Use the "Compose" tab to send custom emails to clients. Select from templates or write a custom message.' },
      { label: 'Manage templates', detail: 'Use the "Templates" tab (admin only) to create reusable email templates with subject lines and HTML body.' },
      { label: 'View sent history', detail: 'The "Sent" tab shows a log of all emails sent with delivery status and timestamps.' },
    ],
    tips: [
      'Emails are sent from bookings@example.com via Resend.',
      'Templates support categories (general, booking, reminder, marketing) for organization.',
      'You can send test emails from the notification settings to preview how they look.',
    ],
  },
  {
    id: 'messages',
    icon: <MessageSquare className="w-5 h-5" />,
    title: 'Internal Messages',
    description: 'How to communicate with team members internally.',
    steps: [
      { label: 'Go to Messages page', detail: 'Click "Messages" in the sidebar.' },
      { label: 'Send a message', detail: 'Select a recipient (other staff member) and type your message.' },
      { label: 'Attach to booking', detail: 'Optionally link a message to a specific booking for context.' },
      { label: 'Read/unread tracking', detail: 'Messages are marked as read when viewed. Unread count appears in the sidebar.' },
    ],
    tips: [
      'Use messages for handoff notes between practitioners.',
      'Internal messages are private — clients cannot see them.',
    ],
  },
  {
    id: 'notifications',
    icon: <Bell className="w-5 h-5" />,
    title: 'Notifications & Reminders',
    description: 'How the notification and reminder system works.',
    steps: [
      { label: 'In-app notifications', detail: 'Click the bell icon in the sidebar to see all notifications (new bookings, check-ins, approvals).' },
      { label: 'Email notifications', detail: 'Booking confirmations, approvals, and cancellations trigger emails to both clients and staff.' },
      { label: 'SMS notifications', detail: 'Clients receive text message reminders before their appointments.' },
      { label: 'Customize notification settings', detail: 'Go to Settings → Notifications to enable/disable specific notification types and edit templates.' },
    ],
    tips: [
      'Emails are sent from bookings@example.com.',
      'Reminder timing can be configured (e.g., 24 hours before, 1 hour before).',
    ],
  },
  {
    id: 'rooms',
    icon: <Home className="w-5 h-5" />,
    title: 'Room Management',
    badge: 'Admin Only',
    badgeVariant: 'outline',
    description: 'How to set up and manage treatment rooms.',
    steps: [
      { label: 'Go to Rooms page', detail: 'Click "Rooms" in the sidebar (admin only).' },
      { label: 'Add a room', detail: 'Define room name, description, capacity, amenities, and a color for the calendar.' },
      { label: 'Room availability', detail: 'The dashboard shows real-time room availability. The calendar "By Room" view shows bookings per room.' },
      { label: 'Assign rooms to bookings', detail: 'When creating or approving bookings, assign a room to avoid conflicts.' },
    ],
    tips: [
      'Deactivate rooms that are temporarily unavailable.',
      'Room capacity helps prevent overbooking for group sessions.',
    ],
  },
  {
    id: 'settings',
    icon: <Settings className="w-5 h-5" />,
    title: 'Settings & Configuration',
    badge: 'Admin Only',
    badgeVariant: 'outline',
    description: 'System-wide settings for the spa.',
    steps: [
      { label: 'Business settings', detail: 'Set business name, address, phone, email, opening/closing hours.' },
      { label: 'Booking settings', detail: 'Configure advance booking days, buffer time between appointments, cancellation policy.' },
      { label: 'Notification settings', detail: 'Enable/disable email and SMS notifications, customize templates.' },
      { label: 'Calendar settings', detail: 'Configure Google Calendar integration settings.' },
      { label: 'Security settings', detail: 'Manage session timeout, password policies.' },
    ],
    tips: [
      'Buffer time adds padding between appointments (e.g., 15 minutes for room turnover).',
      'Cancellation policy text is shown to clients during booking.',
    ],
  },
  {
    id: 'hipaa',
    icon: <Shield className="w-5 h-5" />,
    title: 'HIPAA BAA',
    description: 'Business Associate Agreement for HIPAA compliance.',
    steps: [
      { label: 'Navigate to HIPAA BAA', detail: 'Click "HIPAA BAA" in the sidebar.' },
      { label: 'Review the agreement', detail: 'Read through the Business Associate Agreement terms.' },
      { label: 'Sign digitally', detail: 'Enter your name, title, and organization, then sign digitally.' },
      { label: 'Store for records', detail: 'Signed BAAs are stored securely in the database with timestamp and IP address.' },
    ],
    tips: [
      'All staff members should sign the BAA.',
      'BAA signatures are logged for audit compliance.',
    ],
  },
];

function FlowCard({ section }: { section: FlowSection }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="border border-border/60 shadow-soft overflow-hidden">
      <CardHeader 
        className="cursor-pointer hover:bg-muted/30 transition-colors py-4 px-5"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sage/10 flex items-center justify-center text-sage shrink-0">
              {section.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
                {section.badge && (
                  <Badge variant={section.badgeVariant || 'default'} className="text-xs">
                    {section.badge}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{section.description}</p>
            </div>
          </div>
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          )}
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="pt-0 px-5 pb-5">
          <Separator className="mb-4" />
          
          {/* Steps */}
          <div className="space-y-3 mb-4">
            <p className="text-sm font-medium text-foreground flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-sage" />
              Step-by-Step Flow
            </p>
            <div className="space-y-2 ml-2">
              {section.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-sage/15 flex items-center justify-center text-xs font-bold text-sage shrink-0">
                      {i + 1}
                    </div>
                    {i < section.steps.length - 1 && (
                      <div className="w-px h-full bg-border min-h-[12px]" />
                    )}
                  </div>
                  <div className="pb-2">
                    <p className="text-sm font-medium text-foreground">{step.label}</p>
                    <p className="text-sm text-muted-foreground">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {section.tips && section.tips.length > 0 && (
            <div className="bg-sage/5 rounded-lg p-4 space-y-2 mb-3">
              <p className="text-sm font-medium text-sage flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" />
                Tips
              </p>
              {section.tips.map((tip, i) => (
                <p key={i} className="text-sm text-muted-foreground ml-5">• {tip}</p>
              ))}
            </div>
          )}

          {/* Warnings */}
          {section.warnings && section.warnings.length > 0 && (
            <div className="bg-destructive/5 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Important
              </p>
              {section.warnings.map((warning, i) => (
                <p key={i} className="text-sm text-muted-foreground ml-5">• {warning}</p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function AdminGuidePage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSections = flowSections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.steps.some(s => s.label.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDownloadPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = flowSections.map(section => `
      <div style="page-break-inside: avoid; margin-bottom: 24px; border: 1px solid #e5e5e5; border-radius: 8px; padding: 20px;">
        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 4px 0; color: #1a1a1a;">
          ${section.title}
          ${section.badge ? `<span style="font-size: 11px; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 500;">${section.badge}</span>` : ''}
        </h2>
        <p style="font-size: 13px; color: #666; margin: 0 0 16px 0;">${section.description}</p>
        <div style="margin-bottom: 12px;">
          <p style="font-size: 13px; font-weight: 600; color: #4a7c59; margin-bottom: 8px;">Step-by-Step Flow</p>
          ${section.steps.map((step, i) => `
            <div style="display: flex; gap: 10px; margin-bottom: 8px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background: #e8f0e4; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: #4a7c59; flex-shrink: 0;">${i + 1}</div>
              <div>
                <p style="font-size: 13px; font-weight: 500; margin: 0;">${step.label}</p>
                <p style="font-size: 12px; color: #666; margin: 2px 0 0 0;">${step.detail}</p>
              </div>
            </div>
          `).join('')}
        </div>
        ${section.tips && section.tips.length > 0 ? `
          <div style="background: #f6faf4; border-radius: 6px; padding: 12px; margin-bottom: 8px;">
            <p style="font-size: 12px; font-weight: 600; color: #4a7c59; margin: 0 0 6px 0;">💡 Tips</p>
            ${section.tips.map(tip => `<p style="font-size: 12px; color: #555; margin: 0 0 4px 16px;">• ${tip}</p>`).join('')}
          </div>
        ` : ''}
        ${section.warnings && section.warnings.length > 0 ? `
          <div style="background: #fef2f2; border-radius: 6px; padding: 12px;">
            <p style="font-size: 12px; font-weight: 600; color: #dc2626; margin: 0 0 6px 0;">⚠️ Important</p>
            ${section.warnings.map(w => `<p style="font-size: 12px; color: #555; margin: 0 0 4px 16px;">• ${w}</p>`).join('')}
          </div>
        ` : ''}
      </div>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Custom Booking Staff Guide</title>
        <style>
          @page { margin: 0.6in; size: letter; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { font-size: 26px; margin-bottom: 4px; }
          .subtitle { font-size: 14px; color: #666; margin-bottom: 8px; }
          .date { font-size: 11px; color: #999; margin-bottom: 24px; }
          hr { border: none; border-top: 1px solid #e5e5e5; margin: 16px 0; }
        </style>
      </head>
      <body>
        <h1>🌿 Custom Booking Massage Studio — Staff Guide</h1>
        <p class="subtitle">Complete reference for all system workflows and features</p>
        <p class="date">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        <hr />
        ${content}
        <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e5e5e5; margin-top: 24px;">
          <p style="font-size: 11px; color: #999;">Custom Booking Massage Studio — Confidential Staff Document</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for rendering then trigger print
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-sage/10 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-sage" />
              </div>
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">
                  Admin Guide
                </h1>
                <p className="text-muted-foreground text-sm">
                  Complete reference for all system workflows and features
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search flows... (e.g. deposit, check-in, SOAP)"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-sage/30"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Quick Nav */}
        <div className="flex flex-wrap gap-1.5">
          {flowSections.map(s => (
            <button
              key={s.id}
              onClick={() => {
                setSearchTerm('');
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-sage/15 text-muted-foreground hover:text-sage transition-colors"
            >
              {s.title}
            </button>
          ))}
        </div>

        <Separator />

        {/* Flow Sections */}
        <div className="space-y-3">
          {filteredSections.map(section => (
            <div key={section.id} id={section.id}>
              <FlowCard section={section} />
            </div>
          ))}

          {filteredSections.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p>No flows match "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
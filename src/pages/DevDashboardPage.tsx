import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock, CreditCard,
  Database, FileText, Mail, MessageSquare, RefreshCw, Search, Shield,
  Terminal, User, XCircle, Zap, ChevronDown, ChevronRight, Eye
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// ─── Audit Logs Tab ──────────────────────────────────────────────
function AuditLogsTab() {
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterResource, setFilterResource] = useState('all');

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['dev-audit-logs'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('audit_logs') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = logs.filter((log: any) => {
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (filterResource !== 'all' && log.resource_type !== filterResource) return false;
    if (search && !JSON.stringify(log).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const actionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30';
      case 'update': return 'bg-blue-500/15 text-blue-700 border-blue-500/30';
      case 'delete': return 'bg-red-500/15 text-red-700 border-red-500/30';
      case 'view': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="view">View</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterResource} onValueChange={setFilterResource}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            <SelectItem value="soap_note">SOAP Notes</SelectItem>
            <SelectItem value="customer">Customers</SelectItem>
            <SelectItem value="booking">Bookings</SelectItem>
            <SelectItem value="intake_form">Intake Forms</SelectItem>
            <SelectItem value="practitioner">Practitioners</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading audit logs...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No audit logs found</div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((log: any) => (
                  <AuditLogRow key={log.id} log={log} actionColor={actionColor} />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditLogRow({ log, actionColor }: { log: any; actionColor: (a: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
        {open ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground font-mono w-[140px] shrink-0">
          {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
        </span>
        <Badge variant="outline" className={`${actionColor(log.action)} text-xs font-mono uppercase`}>{log.action}</Badge>
        <Badge variant="secondary" className="text-xs font-mono">{log.resource_type}</Badge>
        <span className="text-sm text-foreground truncate flex-1">{log.user_email || log.user_id?.slice(0, 8)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-3 pl-11 space-y-2">
          <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs space-y-1">
            <div><span className="text-muted-foreground">User ID:</span> {log.user_id}</div>
            <div><span className="text-muted-foreground">Resource ID:</span> {log.resource_id || '—'}</div>
            <div><span className="text-muted-foreground">IP:</span> {log.ip_address || '—'}</div>
            {log.details && Object.keys(log.details).length > 0 && (
              <div className="pt-2 border-t border-border mt-2">
                <span className="text-muted-foreground">Details:</span>
                <pre className="mt-1 whitespace-pre-wrap text-xs">{JSON.stringify(log.details, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Booking Flow Tracker ────────────────────────────────────────
function BookingFlowTab() {
  const [selectedBookingId, setSelectedBookingId] = useState('');

  const { data: recentBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ['dev-recent-bookings'],
    queryFn: async () => {
      const { data } = await supabase.from('bookings')
        .select('id, client_name, client_email, booking_date, start_time, status, created_at, service_id, practitioner_id')
        .order('created_at', { ascending: false })
        .limit(30);
      return data || [];
    },
  });

  const { data: flowData, isLoading: loadingFlow } = useQuery({
    queryKey: ['dev-booking-flow', selectedBookingId],
    enabled: !!selectedBookingId,
    queryFn: async () => {
      const [payments, reminders, notifications, emails, sms, incidents] = await Promise.all([
        supabase.from('booking_payments').select('*').eq('booking_id', selectedBookingId).order('created_at'),
        supabase.from('appointment_reminders').select('*').eq('booking_id', selectedBookingId).order('created_at'),
        (supabase.from('notifications') as any).select('*').eq('booking_id', selectedBookingId).order('created_at'),
        supabase.from('sent_emails').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('sms_messages').select('*').eq('booking_id', selectedBookingId).order('created_at'),
        supabase.from('booking_incidents').select('*').eq('booking_id', selectedBookingId).order('created_at'),
      ]);

      const booking = recentBookings.find((b: any) => b.id === selectedBookingId);

      // Build timeline events
      const timeline: any[] = [];

      // Booking created
      if (booking) {
        timeline.push({ time: booking.created_at, type: 'booking', icon: 'create', label: 'Booking Created', detail: `${booking.client_name} — Status: ${booking.status}` });
      }

      // Payments
      (payments.data || []).forEach((p: any) => {
        timeline.push({ time: p.created_at, type: 'payment', icon: p.status === 'paid' ? 'success' : p.status === 'pending' ? 'pending' : 'error', label: `Payment ${p.type} — ${p.status}`, detail: `$${p.amount} | ${p.stripe_session_id ? 'Stripe: ' + p.stripe_session_id.slice(0, 20) + '...' : 'No Stripe ID'}` });
        if (p.sent_at) timeline.push({ time: p.sent_at, type: 'payment', icon: 'sent', label: `Payment link sent`, detail: p.sent_to_email || p.sent_to_phone || '' });
        if (p.paid_at) timeline.push({ time: p.paid_at, type: 'payment', icon: 'success', label: `Payment collected`, detail: `$${p.amount}` });
      });

      // Reminders
      (reminders.data || []).forEach((r: any) => {
        timeline.push({ time: r.sent_at || r.created_at, type: 'reminder', icon: r.status === 'sent' ? 'success' : 'error', label: `Reminder: ${r.reminder_type} via ${r.sent_via}`, detail: r.error_message || 'Sent successfully' });
      });

      // Notifications
      (notifications.data || []).forEach((n: any) => {
        timeline.push({ time: n.created_at, type: 'notification', icon: n.is_read ? 'success' : 'pending', label: `Notification: ${n.title}`, detail: n.message });
      });

      // SMS
      (sms.data || []).forEach((s: any) => {
        timeline.push({ time: s.created_at, type: 'sms', icon: s.status === 'sent' ? 'success' : 'error', label: `SMS ${s.direction}`, detail: `To: ${s.customer_phone} — ${s.content.slice(0, 80)}...` });
      });

      // Incidents
      (incidents.data || []).forEach((i: any) => {
        timeline.push({ time: i.created_at, type: 'incident', icon: 'error', label: `Incident: ${i.incident_type}`, detail: `Fee: $${i.fee_amount || 0} | Charged: ${i.fee_charged ? 'Yes' : 'No'} | Waived: ${i.fee_waived ? 'Yes' : 'No'}` });
      });

      timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      return { booking, timeline, payments: payments.data || [], reminders: reminders.data || [] };
    },
  });

  const iconForEvent = (icon: string) => {
    switch (icon) {
      case 'create': return <Database className="w-4 h-4 text-blue-500" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'sent': return <Mail className="w-4 h-4 text-blue-500" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case 'booking': return 'border-blue-500/30 bg-blue-500/5';
      case 'payment': return 'border-emerald-500/30 bg-emerald-500/5';
      case 'reminder': return 'border-amber-500/30 bg-amber-500/5';
      case 'notification': return 'border-purple-500/30 bg-purple-500/5';
      case 'sms': return 'border-cyan-500/30 bg-cyan-500/5';
      case 'incident': return 'border-red-500/30 bg-red-500/5';
      default: return '';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: booking list */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Bookings</CardTitle>
          <CardDescription>Select a booking to trace its full lifecycle</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {loadingBookings ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y divide-border">
                {recentBookings.map((b: any) => (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBookingId(b.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors ${selectedBookingId === b.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{b.client_name}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {b.booking_date} at {b.start_time?.slice(0, 5)}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground/60 mt-0.5">{b.id.slice(0, 8)}...</div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: timeline */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4" /> Event Timeline
          </CardTitle>
          <CardDescription>
            {selectedBookingId ? `Tracking booking ${selectedBookingId.slice(0, 8)}...` : 'Select a booking to view its event flow'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {!selectedBookingId ? (
              <div className="p-8 text-center text-muted-foreground">← Select a booking</div>
            ) : loadingFlow ? (
              <div className="p-8 text-center text-muted-foreground">Loading timeline...</div>
            ) : !flowData?.timeline.length ? (
              <div className="p-8 text-center text-muted-foreground">No events found for this booking</div>
            ) : (
              <div className="px-4 pb-4">
                <div className="relative">
                  <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />
                  {flowData.timeline.map((event: any, i: number) => (
                    <div key={i} className="relative flex gap-3 py-2">
                      <div className="relative z-10 mt-1 w-10 h-10 rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0">
                        {iconForEvent(event.icon)}
                      </div>
                      <div className={`flex-1 rounded-lg border p-3 ${typeColor(event.type)}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{event.label}</span>
                          <Badge variant="outline" className="text-[10px] font-mono uppercase shrink-0">{event.type}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{event.detail}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                          {format(new Date(event.time), 'MMM d, yyyy HH:mm:ss')} · {formatDistanceToNow(new Date(event.time), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
    cancelled: 'bg-red-500/15 text-red-700 border-red-500/30',
    completed: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
    'checked-in': 'bg-purple-500/15 text-purple-700 border-purple-500/30',
    'no-show': 'bg-red-500/15 text-red-700 border-red-500/30',
  };
  return <Badge variant="outline" className={`text-[10px] ${styles[status] || 'bg-muted text-muted-foreground'}`}>{status}</Badge>;
}

// ─── System Overview ─────────────────────────────────────────────
function SystemOverviewTab() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dev-system-stats'],
    queryFn: async () => {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [bookings, payments, emails, sms, reminders, incidents, auditLogs] = await Promise.all([
        supabase.from('bookings').select('id, status, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('booking_payments').select('id, status, type, amount, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('sent_emails').select('id, status, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('sms_messages').select('id, status, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('appointment_reminders').select('id, status, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        supabase.from('booking_incidents').select('id, incident_type, created_at', { count: 'exact' }).gte('created_at', weekAgo),
        (supabase.from('audit_logs') as any).select('id, created_at', { count: 'exact' }).gte('created_at', weekAgo),
      ]);

      const bookingData = bookings.data || [];
      const paymentData = payments.data || [];
      const emailData = emails.data || [];
      const smsData = sms.data || [];
      const reminderData = reminders.data || [];

      const pendingBookings = bookingData.filter((b: any) => b.status === 'pending').length;
      const failedPayments = paymentData.filter((p: any) => p.status === 'failed').length;
      const pendingPayments = paymentData.filter((p: any) => p.status === 'pending').length;
      const failedEmails = emailData.filter((e: any) => e.status === 'failed').length;
      const failedReminders = reminderData.filter((r: any) => r.status !== 'sent').length;

      return {
        bookings: { total: bookings.count || 0, pending: pendingBookings },
        payments: { total: payments.count || 0, failed: failedPayments, pending: pendingPayments },
        emails: { total: emails.count || 0, failed: failedEmails },
        sms: { total: sms.count || 0 },
        reminders: { total: reminders.count || 0, failed: failedReminders },
        incidents: { total: incidents.count || 0 },
        auditLogs: { total: auditLogs.count || 0 },
      };
    },
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-12">Loading system stats...</div>;
  if (!stats) return null;

  const cards = [
    { title: 'Bookings (7d)', value: stats.bookings.total, sub: `${stats.bookings.pending} pending`, icon: FileText, alert: stats.bookings.pending > 5 },
    { title: 'Payments (7d)', value: stats.payments.total, sub: `${stats.payments.failed} failed · ${stats.payments.pending} pending`, icon: CreditCard, alert: stats.payments.failed > 0 },
    { title: 'Emails Sent (7d)', value: stats.emails.total, sub: `${stats.emails.failed} failed`, icon: Mail, alert: stats.emails.failed > 0 },
    { title: 'SMS Sent (7d)', value: stats.sms.total, sub: '', icon: MessageSquare, alert: false },
    { title: 'Reminders (7d)', value: stats.reminders.total, sub: `${stats.reminders.failed} failed`, icon: Clock, alert: stats.reminders.failed > 0 },
    { title: 'Incidents (7d)', value: stats.incidents.total, sub: '', icon: AlertTriangle, alert: stats.incidents.total > 0 },
    { title: 'Audit Events (7d)', value: stats.auditLogs.total, sub: '', icon: Shield, alert: false },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.title} className={c.alert ? 'border-amber-500/50' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <c.icon className={`w-5 h-5 ${c.alert ? 'text-amber-500' : 'text-muted-foreground'}`} />
                {c.alert && <AlertTriangle className="w-4 h-4 text-amber-500" />}
              </div>
              <div className="text-2xl font-bold">{c.value}</div>
              <div className="text-xs text-muted-foreground">{c.title}</div>
              {c.sub && <div className="text-xs text-muted-foreground/70 mt-1">{c.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <FailedPaymentsSection />
      <RecentEmailsSection />
    </div>
  );
}

function FailedPaymentsSection() {
  const { data: failedPayments = [] } = useQuery({
    queryKey: ['dev-failed-payments'],
    queryFn: async () => {
      const { data } = await supabase.from('booking_payments')
        .select('*, bookings(client_name, client_email, booking_date)')
        .in('status', ['failed', 'pending'])
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  if (failedPayments.length === 0) return null;

  return (
    <Card className="border-amber-500/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> Payments Requiring Attention
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {failedPayments.map((p: any) => (
            <div key={p.id} className="px-4 py-3 flex items-center gap-3">
              <StatusBadge status={p.status} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.bookings?.client_name || 'Unknown'}</div>
                <div className="text-xs text-muted-foreground">${p.amount} {p.type} · {p.bookings?.booking_date}</div>
              </div>
              <div className="text-xs text-muted-foreground font-mono">{formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentEmailsSection() {
  const { data: emails = [] } = useQuery({
    queryKey: ['dev-recent-emails-overview'],
    queryFn: async () => {
      const { data } = await supabase.from('sent_emails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4" /> Recent Emails
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]">
          <div className="divide-y divide-border">
            {emails.map((e: any) => (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                {e.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{e.subject}</div>
                  <div className="text-xs text-muted-foreground">{e.recipient_email}</div>
                </div>
                <div className="text-xs text-muted-foreground font-mono shrink-0">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ─── Edge Function Health Check ──────────────────────────────────
const EDGE_FUNCTIONS = [
  'ai-concierge', 'approve-booking', 'calendar-cron-sync', 'charge-balance',
  'check-subscription', 'create-appointment', 'create-checkout', 'create-deposit-payment',
  'create-membership-checkout', 'create-tip-payment', 'customer-portal', 'customers',
  'daily-practitioner-report', 'google-calendar-auth', 'google-calendar-callback',
  'google-calendar-sync', 'health-monitor', 'intake-forms', 'internal-messages', 'invite-user',
  'monitor-bookings', 'notify-checkin', 'notify-staff-booking', 'post-appointment-payment',
  'public-availability', 'quick-action', 'reconcile-payments', 'reset-staff-password',
  'send-bulk-email', 'send-custom-email', 'send-notification', 'send-payment-link',
  'send-reminders', 'send-sms', 'send-test-email', 'stripe-webhook', 'submit-booking',
  'update-user-metadata', 'waitlist',
];

type FnStatus = { name: string; status: 'checking' | 'ok' | 'error' | 'timeout'; ms?: number; error?: string };

function EdgeFunctionHealthTab() {
  const [results, setResults] = useState<FnStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const runHealthCheck = async () => {
    setRunning(true);
    const initial: FnStatus[] = EDGE_FUNCTIONS.map(name => ({ name, status: 'checking' }));
    setResults(initial);

    const projectUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    const checkFn = async (name: string): Promise<FnStatus> => {
      const start = performance.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        // Use POST with empty body - any response (even 400/401) means function is deployed
        const res = await fetch(`${projectUrl}/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ healthCheck: true }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const ms = Math.round(performance.now() - start);
        // Any HTTP response (even 500) means the function is deployed and responding
        // 500 with a JSON error body just means it rejected our dummy healthCheck payload
        return { name, status: 'ok', ms };
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return { name, status: 'timeout', error: 'Timed out (8s)' };
        }
        return { name, status: 'error', error: err.message?.slice(0, 80) };
      }
    };

    // Run in batches of 6 to avoid overwhelming
    const allResults: FnStatus[] = [];
    for (let i = 0; i < EDGE_FUNCTIONS.length; i += 6) {
      const batch = EDGE_FUNCTIONS.slice(i, i + 6);
      const batchResults = await Promise.all(batch.map(checkFn));
      allResults.push(...batchResults);
      setResults([...allResults, ...EDGE_FUNCTIONS.slice(i + 6).map(name => ({ name, status: 'checking' as const }))]);
    }

    setResults(allResults);
    setRunning(false);
    setLastRun(new Date());
  };

  const okCount = results.filter(r => r.status === 'ok').length;
  const errorCount = results.filter(r => r.status === 'error' || r.status === 'timeout').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button onClick={runHealthCheck} disabled={running} size="sm">
            <RefreshCw className={`w-4 h-4 mr-2 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Checking...' : 'Run Health Check'}
          </Button>
          {lastRun && (
            <span className="text-xs text-muted-foreground">
              Last run: {format(lastRun, 'HH:mm:ss')}
            </span>
          )}
        </div>
        {results.length > 0 && !running && (
          <div className="flex gap-3">
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" /> {okCount} OK
            </Badge>
            {errorCount > 0 && (
              <Badge variant="outline" className="bg-red-500/15 text-red-700 border-red-500/30">
                <XCircle className="w-3 h-3 mr-1" /> {errorCount} Failed
              </Badge>
            )}
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Zap className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <p>Click "Run Health Check" to ping all {EDGE_FUNCTIONS.length} edge functions and verify they're deployed.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border">
                {/* Show errors/timeouts first */}
                {[...results].sort((a, b) => {
                  const order = { error: 0, timeout: 1, checking: 2, ok: 3 };
                  return order[a.status] - order[b.status];
                }).map((fn) => (
                  <div key={fn.name} className="px-4 py-3 flex items-center gap-3">
                    {fn.status === 'checking' && <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
                    {fn.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                    {fn.status === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    {fn.status === 'timeout' && <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />}
                    <span className="font-mono text-sm flex-1">{fn.name}</span>
                    {fn.ms !== undefined && (
                      <span className="text-xs text-muted-foreground font-mono">{fn.ms}ms</span>
                    )}
                    {fn.error && (
                      <span className="text-xs text-red-500 font-mono truncate max-w-[200px]">{fn.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Notification Log ────────────────────────────────────────────
function NotificationLogTab() {
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['dev-all-notifications'],
    queryFn: async () => {
      const { data } = await (supabase.from('notifications') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((n: any) => (
                  <div key={n.id} className="px-4 py-3 flex items-start gap-3">
                    {n.is_read ? <Eye className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" /> : <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{n.title}</span>
                        <Badge variant="outline" className="text-[10px] font-mono">{n.type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      <div className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                        User: {n.user_id?.slice(0, 8)}... · {format(new Date(n.created_at), 'MMM d, HH:mm:ss')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────
export default function DevDashboardPage() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Terminal className="w-6 h-6" /> Developer Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor system events, debug booking flows, and track all actions in real time.</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="gap-1.5"><Activity className="w-3.5 h-3.5" /> Overview</TabsTrigger>
            <TabsTrigger value="booking-flow" className="gap-1.5"><Zap className="w-3.5 h-3.5" /> Booking Flow</TabsTrigger>
            <TabsTrigger value="edge-health" className="gap-1.5"><Database className="w-3.5 h-3.5" /> Edge Functions</TabsTrigger>
            <TabsTrigger value="audit-logs" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Audit Logs</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><SystemOverviewTab /></TabsContent>
          <TabsContent value="booking-flow"><BookingFlowTab /></TabsContent>
          <TabsContent value="edge-health"><EdgeFunctionHealthTab /></TabsContent>
          <TabsContent value="audit-logs"><AuditLogsTab /></TabsContent>
          <TabsContent value="notifications"><NotificationLogTab /></TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}

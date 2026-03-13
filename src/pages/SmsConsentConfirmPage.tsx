import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertCircle, Loader2, MessageSquare, Bell, Calendar, UserCheck, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type ConsentState = 'loading' | 'ready' | 'confirming' | 'success' | 'already_confirmed' | 'error';

export default function SmsConsentConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<ConsentState>('loading');
  const [practitionerName, setPractitionerName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('No consent token provided. Please use the link sent to you by your administrator.');
      return;
    }

    // Validate token format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(token)) {
      setState('error');
      setErrorMessage('Invalid consent link. Please contact your administrator.');
      return;
    }

    // Token looks valid, show the consent form
    setState('ready');
  }, [token]);

  const handleConfirm = async () => {
    if (!token) return;
    if (!phone || phone.trim().length < 10) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }
    setState('confirming');

    try {
      const { data, error } = await supabase.functions.invoke('confirm-sms-consent', {
        body: { token, phone: phone.trim() },
      });

      if (error) throw error;

      if (data?.already_consented) {
        setPractitionerName(data.practitioner_name || '');
        setState('already_confirmed');
      } else if (data?.success) {
        setPractitionerName(data.practitioner_name || '');
        setState('success');
      } else {
        throw new Error(data?.error || 'Unexpected response');
      }
    } catch (err: any) {
      console.error('Consent confirmation error:', err);
      setErrorMessage(err?.message || 'Failed to confirm consent. The link may be invalid or expired.');
      setState('error');
    }
  };

  const notificationTypes = [
    { icon: <Calendar className="w-4 h-4" />, label: 'New booking assignments', desc: 'When a client books an appointment with you' },
    { icon: <UserCheck className="w-4 h-4" />, label: 'Client check-in alerts', desc: 'When your client arrives and checks in' },
    { icon: <Bell className="w-4 h-4" />, label: 'Appointment reminders', desc: 'Upcoming appointment notifications' },
    { icon: <MessageSquare className="w-4 h-4" />, label: 'Schedule changes', desc: 'When appointments are rescheduled or updated' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sage/10 to-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-display text-xl">
            {state === 'success' ? 'SMS Notifications Confirmed!' :
             state === 'already_confirmed' ? 'Already Confirmed' :
             state === 'error' ? 'Something Went Wrong' :
             'SMS Notification Consent'}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Custom Booking</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {state === 'loading' && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {state === 'ready' && (
            <>
              <p className="text-sm text-muted-foreground text-center">
                By confirming, you consent to receive SMS text message notifications from Custom Booking at the phone number you provide below. These are operational notifications only — not marketing messages.
              </p>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Your Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(808) 555-1234"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                />
                {errorMessage && (
                  <p className="text-xs text-destructive">{errorMessage}</p>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">You will receive notifications for:</p>
                {notificationTypes.map((nt, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="mt-0.5 text-primary">{nt.icon}</div>
                    <div>
                      <p className="text-sm font-medium">{nt.label}</p>
                      <p className="text-xs text-muted-foreground">{nt.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/30 rounded-lg">
                <p>• Standard message and data rates may apply</p>
                <p>• You can revoke consent at any time by contacting your administrator</p>
                <p>• Messages are sent via our verified business number</p>
              </div>

              <Button
                variant="sage"
                className="w-full"
                size="lg"
                onClick={handleConfirm}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Confirm SMS Notifications
              </Button>
            </>
          )}

          {state === 'confirming' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Confirming your consent...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center space-y-2">
                {practitionerName && (
                  <p className="font-medium">Thank you, {practitionerName}!</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Your SMS notification consent has been recorded. You will now receive text notifications for new bookings, check-ins, and appointment reminders.
                </p>
                <Badge variant="secondary" className="mt-2">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Consent recorded with timestamp and IP
                </Badge>
              </div>
            </div>
          )}

          {state === 'already_confirmed' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-blue-600" />
              </div>
              <div className="text-center space-y-2">
                {practitionerName && (
                  <p className="font-medium">{practitionerName}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Your SMS consent was already confirmed. No further action is needed.
                </p>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">{errorMessage}</p>
                <p className="text-xs text-muted-foreground">
                  Contact support@example.com if you need assistance.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

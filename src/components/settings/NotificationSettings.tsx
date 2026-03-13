import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { Loader2, Mail, MessageSquare, Users, Clock, Pencil, Calendar, Bell, UserCheck, Eye, Send, Phone, CheckCircle2, Link, Copy } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface NotificationSetting {
  id: string;
  event_type: string;
  event_label: string;
  event_description: string | null;
  category: string;
  email_enabled: boolean;
  email_subject_template: string | null;
  email_body_template: string | null;
  sms_enabled: boolean;
  sms_template: string | null;
  send_to_client: boolean;
  send_to_staff: boolean;
  timing_minutes: number | null;
}

const categoryIcons: Record<string, React.ReactNode> = {
  bookings: <Calendar className="w-4 h-4" />,
  reminders: <Clock className="w-4 h-4" />,
  checkin: <UserCheck className="w-4 h-4" />,
  staff: <Users className="w-4 h-4" />,
  waitlist: <Bell className="w-4 h-4" />,
};

const categoryLabels: Record<string, string> = {
  bookings: 'Booking Notifications',
  reminders: 'Appointment Reminders',
  checkin: 'Check-in Notifications',
  staff: 'Staff Notifications',
  waitlist: 'Waitlist Notifications',
};

const SAMPLE_DATA: Record<string, string> = {
  '{{client_name}}': 'Jane Smith',
  '{{date}}': 'Monday, March 10, 2026',
  '{{time}}': '10:00 AM',
  '{{business_name}}': 'Custom Booking',
  '{{service_name}}': 'Deep Tissue Massage 60min',
  '{{practitioner_name}}': 'Kyle Anderson',
};

function replacePlaceholders(template: string): string {
  let result = template;
  for (const [placeholder, value] of Object.entries(SAMPLE_DATA)) {
    result = result.split(placeholder).join(value);
  }
  return result;
}

function buildEmailPreviewHtml(subject: string, body: string): string {
  const renderedSubject = replacePlaceholders(subject);
  const renderedBody = replacePlaceholders(body);
  
  // Convert newlines to <br> for plain text body content
  const bodyHtml = renderedBody
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  return `
    <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
      <div style="background-color: #2d5016; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">Custom Booking</h1>
      </div>
      <div style="padding: 32px;">
        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">Subject: ${renderedSubject}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
        <div style="font-size: 15px; line-height: 1.7; color: #333;">
          ${bodyHtml}
        </div>
      </div>
      <div style="margin-top: 0; padding: 20px 32px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px; background-color: #f9fafb;">
        <p style="margin: 4px 0;">Custom Booking</p>
        <p style="margin: 4px 0;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p>
        <p style="margin: 4px 0;">support@example.com</p>
      </div>
    </div>
  `;
}

export function NotificationSettings() {
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [settings, setSettings] = useState<NotificationSetting[]>([]);
  const [editingSetting, setEditingSetting] = useState<NotificationSetting | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [provisioningKlaviyo, setProvisioningKlaviyo] = useState(false);
  const [generatingConsent, setGeneratingConsent] = useState(false);
  const [sendingConsentEmails, setSendingConsentEmails] = useState(false);
  const [consentLinks, setConsentLinks] = useState<Array<{
    id: string;
    name: string;
    phone: string | null;
    status: string;
    url?: string;
  }>>([]);
  const [showConsentSection, setShowConsentSection] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (user?.email) setTestEmail(user.email);
  }, [user?.email]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .order('category', { ascending: true })
        .order('event_label', { ascending: true });

      if (error) throw error;
      setSettings(data || []);
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      toast.error('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, field: 'email_enabled' | 'sms_enabled' | 'send_to_client' | 'send_to_staff', value: boolean) => {
    try {
      const { error } = await supabase
        .from('notification_settings')
        .update({ [field]: value })
        .eq('id', id);

      if (error) throw error;

      setSettings(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
      toast.success('Setting updated');
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to update setting');
    }
  };

  const handleEditSave = async () => {
    if (!editingSetting) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('notification_settings')
        .update({
          email_subject_template: editingSetting.email_subject_template,
          email_body_template: editingSetting.email_body_template,
          sms_template: editingSetting.sms_template,
        })
        .eq('id', editingSetting.id);

      if (error) throw error;

      setSettings(prev => prev.map(s => s.id === editingSetting.id ? editingSetting : s));
      setEditDialogOpen(false);
      setEditingSetting(null);
      toast.success('Templates saved successfully');
    } catch (error) {
      console.error('Error saving templates:', error);
      toast.error('Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!editingSetting || !testEmail) {
      toast.error('Please enter an email address');
      return;
    }

    setSendingTest(true);
    try {
      const subject = replacePlaceholders(editingSetting.email_subject_template || 'Test Notification');
      const bodyText = replacePlaceholders(editingSetting.email_body_template || '');
      const bodyHtml = bodyText.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      
      const fullHtml = `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #333;">
          <h2 style="color: #2d5016;">${subject}</h2>
          <div style="font-size: 15px; line-height: 1.7;">${bodyHtml}</div>
          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
            <p style="margin: 4px 0;">Custom Booking</p>
            <p style="margin: 4px 0;">68-1330 Mauna Lani Dr. Suite 106, Kamuela, HI 96743</p>
            <p style="margin: 4px 0;">support@example.com</p>
            <p style="margin: 8px 0; font-style: italic;">⚠️ This is a TEST email — no real appointment was created.</p>
          </div>
        </div>
      `;

      const { error } = await supabase.functions.invoke('send-test-email', {
        body: { to: testEmail, subject: `[TEST] ${subject}`, html: fullHtml },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));
      toast.success(`Test email sent to ${testEmail}`);
    } catch (error) {
      console.error('Error sending test email:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send test email');
    } finally {
      setSendingTest(false);
    }
  };

  const previewHtml = useMemo(() => {
    if (!editingSetting) return '';
    return buildEmailPreviewHtml(
      editingSetting.email_subject_template || '',
      editingSetting.email_body_template || ''
    );
  }, [editingSetting?.email_subject_template, editingSetting?.email_body_template]);

  const groupedSettings = settings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, NotificationSetting[]>);

  if (!isAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Notification Settings</CardTitle>
          <CardDescription>
            Only administrators can manage notification settings
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display">Notification Settings</CardTitle>
              <CardDescription>
                Configure email and SMS notifications for all events. Use placeholders like {"{{client_name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{business_name}}"} in templates.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={provisioningKlaviyo}
              onClick={async () => {
                setProvisioningKlaviyo(true);
                try {
                  const { data, error } = await supabase.functions.invoke('setup-klaviyo-flows');
                  if (error) throw new Error(await getFunctionErrorMessage(error));
                  const results = data?.results || [];
                  const created = results.filter((r: any) => r.status === 'created').length;
                  const skipped = results.filter((r: any) => r.status === 'skipped').length;
                  const failed = results.filter((r: any) => r.status === 'failed').length;
                  if (failed > 0) {
                    toast.error(`Klaviyo: ${created} created, ${skipped} skipped, ${failed} failed. Check logs.`);
                  } else {
                    toast.success(`Klaviyo flows: ${created} created, ${skipped} already exist`);
                  }
                } catch (err) {
                  console.error('Klaviyo flow setup error:', err);
                  toast.error(err instanceof Error ? err.message : 'Failed to provision Klaviyo flows');
                } finally {
                  setProvisioningKlaviyo(false);
                }
              }}
            >
              {provisioningKlaviyo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
              Setup Klaviyo SMS Flows
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {Object.entries(groupedSettings).map(([category, categorySettings]) => (
              <AccordionItem key={category} value={category}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      {categoryIcons[category] || <Bell className="w-4 h-4" />}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{categoryLabels[category] || category}</p>
                      <p className="text-sm text-muted-foreground">
                        {categorySettings.length} notification{categorySettings.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-4">
                    {categorySettings.map((setting) => (
                      <div
                        key={setting.id}
                        className="border rounded-lg p-4 space-y-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-card-foreground">
                                {setting.event_label}
                              </h4>
                              {setting.timing_minutes && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {setting.timing_minutes >= 60 
                                    ? `${setting.timing_minutes / 60}h before` 
                                    : `${setting.timing_minutes}m before`}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {setting.event_description}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingSetting(setting);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                          <div className="flex items-center justify-between p-2 sm:p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                              <span className="text-xs sm:text-sm">Email</span>
                            </div>
                            <Switch
                              checked={setting.email_enabled}
                              onCheckedChange={(checked) => handleToggle(setting.id, 'email_enabled', checked)}
                            />
                          </div>

                          <div className="flex items-center justify-between p-2 sm:p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                              <span className="text-xs sm:text-sm">SMS</span>
                            </div>
                            <Switch
                              checked={setting.sms_enabled}
                              onCheckedChange={(checked) => handleToggle(setting.id, 'sms_enabled', checked)}
                            />
                          </div>

                          <div className="flex items-center justify-between p-2 sm:p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                              <span className="text-xs sm:text-sm">Client</span>
                            </div>
                            <Switch
                              checked={setting.send_to_client}
                              onCheckedChange={(checked) => handleToggle(setting.id, 'send_to_client', checked)}
                            />
                          </div>

                          <div className="flex items-center justify-between p-2 sm:p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
                              <span className="text-xs sm:text-sm">Staff</span>
                            </div>
                            <Switch
                              checked={setting.send_to_staff}
                              onCheckedChange={(checked) => handleToggle(setting.id, 'send_to_staff', checked)}
                            />
                          </div>
                        </div>

                        {(setting.email_subject_template || setting.sms_template) && (
                          <div className="text-xs text-muted-foreground space-y-1">
                            {setting.email_subject_template && (
                              <p><span className="font-medium">Email Subject:</span> {setting.email_subject_template}</p>
                            )}
                            {setting.sms_template && (
                              <p><span className="font-medium">SMS:</span> {setting.sms_template}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Practitioner SMS Consent Links */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Practitioner SMS Consent
              </CardTitle>
              <CardDescription>
                Generate unique consent links for each practitioner. SMS notifications will only be sent to practitioners who have confirmed consent.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={sendingConsentEmails}
              onClick={async () => {
                setSendingConsentEmails(true);
                setShowConsentSection(true);
                try {
                  const { data, error } = await supabase.functions.invoke('send-sms-consent-emails');
                  if (error) throw new Error(await getFunctionErrorMessage(error));
                  const results = data?.results || [];
                  const sent = results.filter((r: any) => r.status === 'email_sent').length;
                  const skipped = results.filter((r: any) => r.status === 'already_consented').length;
                  const failed = results.filter((r: any) => r.status === 'email_failed').length;
                  
                  // Transform results to match consent link display format
                  setConsentLinks(results.map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    phone: null,
                    status: r.status === 'already_consented' ? 'already_consented' : r.status === 'email_sent' ? 'email_sent' : 'error',
                    url: undefined,
                  })));
                  
                  if (failed > 0) {
                    toast.error(`Sent ${sent}, skipped ${skipped} (already consented), ${failed} failed`);
                  } else {
                    toast.success(`Consent emails sent to ${sent} practitioner${sent !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} already consented` : ''}`);
                  }
                } catch (err) {
                  console.error('Error sending consent emails:', err);
                  toast.error(err instanceof Error ? err.message : 'Failed to send consent emails');
                } finally {
                  setSendingConsentEmails(false);
                }
              }}
            >
              {sendingConsentEmails ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Send Consent Emails
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={generatingConsent}
              onClick={async () => {
                setGeneratingConsent(true);
                setShowConsentSection(true);
                try {
                  const { data, error } = await supabase.functions.invoke('generate-sms-consent-link');
                  if (error) throw new Error(await getFunctionErrorMessage(error));
                  setConsentLinks(data?.practitioners || []);
                  toast.success('Consent links generated');
                } catch (err) {
                  console.error('Error generating consent links:', err);
                  toast.error(err instanceof Error ? err.message : 'Failed to generate consent links');
                } finally {
                  setGeneratingConsent(false);
                }
              }}
            >
              {generatingConsent ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Link className="w-4 h-4 mr-2" />}
              Copy Links Only
            </Button>
          </div>
        </CardHeader>
        {showConsentSection && (
          <CardContent>
            {consentLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active practitioners found.
              </p>
            ) : (
              <div className="space-y-3">
                {consentLinks.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        p.status === 'already_consented' ? 'bg-green-500' : p.status === 'email_sent' ? 'bg-blue-500' : 'bg-amber-500'
                      }`} />
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.phone || 'No phone yet — will be collected on consent'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.status === 'already_consented' ? (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Consented
                        </Badge>
                      ) : p.status === 'email_sent' ? (
                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                          <Send className="w-3 h-3 mr-1" />
                          Email Sent
                        </Badge>
                      ) : p.url ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(p.url!);
                            toast.success(`Consent link copied for ${p.name}`);
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Copy Link
                        </Button>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Error</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Notification Templates</DialogTitle>
            <DialogDescription>
              Customize the email and SMS templates for "{editingSetting?.event_label}". 
              Available placeholders: {"{{client_name}}"}, {"{{date}}"}, {"{{time}}"}, {"{{business_name}}"}, {"{{service_name}}"}, {"{{practitioner_name}}"}
            </DialogDescription>
          </DialogHeader>

          {editingSetting && (
            <Tabs defaultValue="edit" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="edit" className="flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="test" className="flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" />
                  Send Test
                </TabsTrigger>
              </TabsList>

              <TabsContent value="edit" className="space-y-6 mt-4">
                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Template
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Subject Line</Label>
                      <Input
                        value={editingSetting.email_subject_template || ''}
                        onChange={(e) => setEditingSetting({
                          ...editingSetting,
                          email_subject_template: e.target.value
                        })}
                        placeholder="e.g., Your appointment at {{business_name}} is confirmed"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Body</Label>
                      <Textarea
                        value={editingSetting.email_body_template || ''}
                        onChange={(e) => setEditingSetting({
                          ...editingSetting,
                          email_body_template: e.target.value
                        })}
                        placeholder="e.g., Hi {{client_name}}, your appointment on {{date}} at {{time}} has been confirmed..."
                        rows={6}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    SMS Template
                  </h4>
                  <div className="space-y-2">
                    <Label>Message (160 char recommended)</Label>
                    <Textarea
                      value={editingSetting.sms_template || ''}
                      onChange={(e) => setEditingSetting({
                        ...editingSetting,
                        sms_template: e.target.value
                      })}
                      placeholder="e.g., Your appointment on {{date}} at {{time}} is confirmed. Reply STOP to unsubscribe."
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      {editingSetting.sms_template?.length || 0} / 160 characters
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Available Placeholders:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(SAMPLE_DATA).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs font-mono">
                        {key} → {value}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <div className="border rounded-lg overflow-hidden bg-muted/30">
                  <div className="p-3 bg-muted border-b flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">Email Preview (with sample data)</span>
                  </div>
                  <div className="p-4" style={{ backgroundColor: '#f3f4f6' }}>
                    <div
                      className="mx-auto"
                      style={{ maxWidth: 600 }}
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="test" className="mt-4 space-y-4">
                <div className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-start gap-3">
                    <Send className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="font-medium">Send a Test Email</h4>
                      <p className="text-sm text-muted-foreground">
                        Send a test version of this notification to any email address. Sample data will be used for all placeholders.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Recipient Email</Label>
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="your@email.com"
                    />
                  </div>

                  <Button
                    variant="sage"
                    onClick={handleSendTestEmail}
                    disabled={sendingTest || !testEmail || !editingSetting.email_subject_template}
                    className="w-full"
                  >
                    {sendingTest ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </>
                    )}
                  </Button>

                  {!editingSetting.email_subject_template && (
                    <p className="text-xs text-destructive">Please add a subject line in the Edit tab first.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="sage" onClick={handleEditSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Templates'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { X, Send, Users, Search, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Recipient {
  email: string;
  name: string;
}

export function ComposeEmail({ onSent }: { onSent: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-for-email', customerSearch],
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select('id, first_name, last_name, email')
        .order('first_name')
        .limit(20);
      if (customerSearch) {
        query = query.or(`first_name.ilike.%${customerSearch}%,last_name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (selectedTemplate && templates) {
      const t = templates.find((tpl: any) => tpl.id === selectedTemplate);
      if (t) {
        setSubject(t.subject);
        setBodyHtml(t.body_html);
        setBodyText(t.body_text || '');
      }
    }
  }, [selectedTemplate, templates]);

  const addRecipient = (email: string, name: string) => {
    if (!email) return;
    if (recipients.some((r) => r.email === email)) {
      toast.error('Recipient already added');
      return;
    }
    setRecipients([...recipients, { email, name }]);
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter((r) => r.email !== email));
  };

  const addAllCustomers = () => {
    if (!customers) return;
    const newRecipients = customers
      .filter((c: any) => !recipients.some((r) => r.email === c.email))
      .map((c: any) => ({ email: c.email, name: `${c.first_name} ${c.last_name}` }));
    setRecipients([...recipients, ...newRecipients]);
    toast.success(`Added ${newRecipients.length} recipients`);
  };

  const handleSend = async () => {
    if (!recipients.length) return toast.error('Add at least one recipient');
    if (!subject.trim()) return toast.error('Subject is required');
    if (!bodyHtml.trim()) return toast.error('Email body is required');

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('send-custom-email', {
        body: {
          recipients,
          subject,
          bodyHtml,
          bodyText: bodyText || undefined,
          templateId: selectedTemplate || undefined,
        },
      });

      if (error) throw new Error(await getFunctionErrorMessage(error));

      const sentCount = data.results?.filter((r: any) => r.status === 'sent').length || 0;
      const failCount = data.results?.filter((r: any) => r.status === 'failed').length || 0;

      if (failCount > 0) {
        toast.warning(`${sentCount} sent, ${failCount} failed`);
      } else {
        toast.success(`Email sent to ${sentCount} recipient(s)`);
      }

      setRecipients([]);
      setSubject('');
      setBodyHtml('');
      setBodyText('');
      setSelectedTemplate('');
      onSent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Recipients */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5" />
            Recipients
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Customer search */}
          <div>
            <Label className="text-sm text-muted-foreground">Search customers</Label>
            <div className="flex gap-2 mt-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Name or email..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {customers?.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => addRecipient(c.email, `${c.first_name} ${c.last_name}`)}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                >
                  <span className="font-medium">{c.first_name} {c.last_name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{c.email}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={addAllCustomers}>
              Add all shown
            </Button>
          </div>

          {/* Manual add */}
          <div className="border-t pt-4">
            <Label className="text-sm text-muted-foreground">Add manually</Label>
            <div className="space-y-2 mt-1">
              <Input placeholder="Name" value={manualName} onChange={(e) => setManualName(e.target.value)} />
              <Input placeholder="Email" type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  addRecipient(manualEmail, manualName);
                  setManualEmail('');
                  setManualName('');
                }}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Selected recipients */}
          <div className="border-t pt-4">
            <Label className="text-sm text-muted-foreground">
              Selected ({recipients.length})
            </Label>
            <div className="mt-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {recipients.map((r) => (
                <Badge key={r.email} variant="secondary" className="gap-1 pr-1">
                  {r.name || r.email}
                  <button onClick={() => removeRecipient(r.email)} className="ml-1 hover:text-destructive">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {recipients.length === 0 && (
                <p className="text-sm text-muted-foreground italic">No recipients added</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compose */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5" />
            Compose
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template selector */}
          <div>
            <Label>Start from template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template (optional)" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject..." />
          </div>

          <div>
            <Label>Body (HTML)</Label>
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="Email body HTML... Use {{client_name}} for personalization"
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Variables: {"{{client_name}}"}, {"{{email}}"}
            </p>
          </div>

          <div>
            <Label>Plain Text Fallback (optional)</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Plain text version..."
              rows={4}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Email Preview</DialogTitle>
                </DialogHeader>
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground mb-2">Subject: <strong>{subject}</strong></p>
                  <div
                    className="mt-4"
                    dangerouslySetInnerHTML={{
                      __html: bodyHtml
                        .replace(/\{\{client_name\}\}/g, 'John Doe')
                        .replace(/\{\{email\}\}/g, 'john@example.com'),
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <Button onClick={handleSend} disabled={sending || !recipients.length} className="gap-2">
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : `Send to ${recipients.length} recipient(s)`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

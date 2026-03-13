import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, FileText, Send, Clock } from 'lucide-react';
import { ComposeEmail } from '@/components/email/ComposeEmail';
import { EmailTemplates } from '@/components/email/EmailTemplates';
import { SentEmails } from '@/components/email/SentEmails';

const EmailPage = () => {
  const [activeTab, setActiveTab] = useState('compose');

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">Email</h1>
          <p className="text-muted-foreground mt-1">Send emails to clients and manage templates</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="compose" className="gap-2">
              <Send className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="w-4 h-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="sent" className="gap-2">
              <Clock className="w-4 h-4" />
              Sent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="mt-6">
            <ComposeEmail onSent={() => setActiveTab('sent')} />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <EmailTemplates />
          </TabsContent>

          <TabsContent value="sent" className="mt-6">
            <SentEmails />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default EmailPage;

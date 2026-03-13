import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Mail, CheckCircle2, XCircle } from 'lucide-react';

export function SentEmails() {
  const { data: sentEmails, isLoading } = useQuery({
    queryKey: ['sent-emails'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sent_emails')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Sent Email History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : !sentEmails?.length ? (
          <p className="text-muted-foreground text-center py-8">No emails sent yet</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sent At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sentEmails.map((email: any) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      {email.status === 'sent' ? (
                        <Badge variant="outline" className="gap-1 text-green-700 border-green-300">
                          <CheckCircle2 className="w-3 h-3" /> Sent
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-destructive border-destructive/30">
                          <XCircle className="w-3 h-3" /> Failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{email.recipient_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{email.recipient_email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-sm">{email.subject}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(email.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

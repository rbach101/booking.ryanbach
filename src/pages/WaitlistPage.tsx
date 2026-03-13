import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Clock, Bell, Trash2, CheckCircle, XCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { debugLog } from '@/lib/debugLog';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';

interface WaitlistEntry {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  service_id: string;
  practitioner_id: string | null;
  preferred_days: number[];
  preferred_time_start: string | null;
  preferred_time_end: string | null;
  date_range_start: string | null;
  date_range_end: string | null;
  status: string;
  notified_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  services?: { name: string } | null;
  practitioners?: { name: string } | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function WaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<WaitlistEntry | null>(null);

  useEffect(() => {
    fetchWaitlist();
  }, []);

  const fetchWaitlist = async () => {
    try {
      const { data, error } = await supabase
        .from('waitlist')
        .select(`
          *,
          services(name),
          practitioners(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching waitlist:', error);
      toast.error('Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('waitlist')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      debugLog('WaitlistPage.tsx:waitlist.update', 'Waitlist status updated', { waitlist_id: id, status });
      toast.success(`Status updated to ${status}`);
      fetchWaitlist();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const openDeleteDialog = (entry: WaitlistEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!entryToDelete) return;
    const id = entryToDelete.id;
    setDeleteDialogOpen(false);
    setEntryToDelete(null);

    try {
      const { error } = await supabase
        .from('waitlist')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Entry removed');
      fetchWaitlist();
    } catch (error) {
      toast.error('Failed to remove entry');
    }
  };

  const handleNotify = async (entry: WaitlistEntry) => {
    try {
      const response = await supabase.functions.invoke('waitlist', {
        body: {
          action: 'notify',
          date: format(new Date(), 'yyyy-MM-dd'),
          start_time: entry.preferred_time_start || '09:00',
          end_time: entry.preferred_time_end || '17:00',
          service_id: entry.service_id,
          practitioner_id: entry.practitioner_id,
        },
      });

      if (response.error) throw response.error;
      toast.success('Notification sent');
      fetchWaitlist();
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send notification');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'notified':
        return <Badge variant="secondary">Notified</Badge>;
      case 'booked':
        return <Badge className="bg-green-600">Booked</Badge>;
      case 'expired':
        return <Badge variant="destructive">Expired</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.client_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Waitlist</h1>
            <p className="text-muted-foreground mt-1">Manage clients waiting for openings</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg px-3 py-1">
              {entries.filter(e => e.status === 'active').length} Active
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="notified">Notified</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredEntries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No waitlist entries</h3>
              <p className="text-muted-foreground text-center">
                Clients can join the waitlist when their preferred times are unavailable.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Preferences</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{entry.client_name}</div>
                          <div className="text-sm text-muted-foreground">{entry.client_email}</div>
                          {entry.client_phone && (
                            <div className="text-sm text-muted-foreground">{entry.client_phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div>{entry.services?.name || 'Any service'}</div>
                          {entry.practitioners?.name && (
                            <div className="text-sm text-muted-foreground">
                              with {entry.practitioners.name}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {entry.preferred_days && entry.preferred_days.length > 0 && (
                            <div className="flex gap-1">
                              {entry.preferred_days.map(day => (
                                <Badge key={day} variant="outline" className="text-xs">
                                  {DAY_NAMES[day]}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {entry.preferred_time_start && entry.preferred_time_end && (
                            <div className="text-sm text-muted-foreground">
                              {entry.preferred_time_start} - {entry.preferred_time_end}
                            </div>
                          )}
                          {entry.date_range_start && entry.date_range_end && (
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(entry.date_range_start), 'MMM d')} - {format(new Date(entry.date_range_end), 'MMM d')}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(entry.status)}
                        {entry.notified_at && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Notified {formatDistanceToNow(new Date(entry.notified_at), { addSuffix: true })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                        </div>
                        {entry.expires_at && (
                          <div className="text-xs text-muted-foreground">
                            Expires {format(new Date(entry.expires_at), 'MMM d')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {entry.status === 'active' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Notify client"
                                onClick={() => handleNotify(entry)}
                              >
                                <Bell className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Mark as booked"
                                onClick={() => handleUpdateStatus(entry.id, 'booked')}
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                            </>
                          )}
                          {entry.status === 'notified' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Mark as booked"
                              onClick={() => handleUpdateStatus(entry.id, 'booked')}
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Remove"
                            aria-label="Remove waitlist entry"
                            onClick={() => openDeleteDialog(entry)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove waitlist entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {entryToDelete?.client_name} from the waitlist? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PractitionerCard } from '@/components/practitioners/PractitionerCard';
import { ScheduleDialog } from '@/components/practitioners/ScheduleDialog';
import { EditPractitionerDialog } from '@/components/practitioners/EditPractitionerDialog';
import { AddPractitionerDialog } from '@/components/practitioners/AddPractitionerDialog';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Loader2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { usePractitioners } from '@/hooks/usePractitioners';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { Practitioner } from '@/types/booking';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

export default function PractitionersPage() {
  const { data: practitioners, isLoading, error, refetch } = usePractitioners();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [scheduleDialog, setScheduleDialog] = useState<{
    open: boolean;
    practitionerId: string;
    practitionerName: string;
  }>({ open: false, practitionerId: '', practitionerName: '' });
  
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    practitioner: Practitioner | null;
  }>({ open: false, practitioner: null });
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Practitioner | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Practitioner | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reactivating, setReactivating] = useState<string | null>(null);

  // Fetch deactivated practitioners when toggle is on
  const { data: deactivatedPractitioners } = useQuery({
    queryKey: ['practitioners-deactivated'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('*')
        .eq('is_active', false)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: showDeactivated && isAdmin,
  });

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      const { error } = await supabase
        .from('practitioners')
        .update({ is_active: false })
        .eq('id', deactivateTarget.id);
      if (error) throw error;
      toast.success(`${deactivateTarget.name} has been removed`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['practitioners-deactivated'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove practitioner');
    } finally {
      setDeactivating(false);
      setDeactivateTarget(null);
    }
  };

  const handleReactivate = async (id: string, name: string) => {
    setReactivating(id);
    try {
      const { error } = await supabase
        .from('practitioners')
        .update({ is_active: true })
        .eq('id', id);
      if (error) throw error;
      toast.success(`${name} has been reactivated`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['practitioners-deactivated'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate practitioner');
    } finally {
      setReactivating(null);
    }
  };

  const handleEditSchedule = (practitionerId: string, practitionerName: string) => {
    setScheduleDialog({ open: true, practitionerId, practitionerName });
  };

  const handleEditInfo = (practitioner: Practitioner) => {
    setEditDialog({ open: true, practitioner });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      const { data, error } = await supabase.functions.invoke('delete-practitioner', {
        headers,
        body: { practitionerId: deleteTarget.id },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || `${deleteTarget.name} has been permanently deleted`);
      setDeleteTarget(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['practitioners-deactivated'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-practitioners'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete practitioner');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Practitioners
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your team and their schedules
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowDeactivated(!showDeactivated)}
                >
                  {showDeactivated ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {showDeactivated ? 'Hide Removed' : 'Show Removed'}
                </Button>
                <Button variant="sage" className="gap-2" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="w-4 h-4" />
                  Add Practitioner
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-12">
            <p className="text-destructive">Failed to load practitioners</p>
          </div>
        )}

        {/* Grid */}
        {practitioners && practitioners.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {practitioners.map((practitioner, index) => (
               <PractitionerCard 
                key={practitioner.id} 
                practitioner={practitioner}
                onEditSchedule={() => handleEditSchedule(practitioner.id, practitioner.name)}
                onEditInfo={isAdmin ? () => handleEditInfo(practitioner) : undefined}
                onDeactivate={isAdmin ? () => setDeactivateTarget(practitioner) : undefined}
                onDelete={isAdmin ? () => setDeleteTarget(practitioner) : undefined}
                showInviteButton={isAdmin}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` } as React.CSSProperties}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {practitioners && practitioners.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No practitioners found</p>
          </div>
        )}

        {/* Deactivated practitioners */}
        {showDeactivated && isAdmin && deactivatedPractitioners && deactivatedPractitioners.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-muted-foreground">Removed Practitioners</h2>
              <Badge variant="secondary">{deactivatedPractitioners.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {deactivatedPractitioners.map((p) => (
                <div
                  key={p.id}
                  className="bg-card/50 border border-border/50 rounded-xl p-4 opacity-70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleReactivate(p.id, p.name)}
                      disabled={reactivating === p.id}
                    >
                      {reactivating === p.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                      Reactivate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                      onClick={() => setDeleteTarget(p)}
                      disabled={deleting}
                    >
                      Delete Permanently
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showDeactivated && isAdmin && deactivatedPractitioners && deactivatedPractitioners.length === 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            No removed practitioners found
          </div>
        )}
      </div>

      <ScheduleDialog
        open={scheduleDialog.open}
        onOpenChange={(open) => setScheduleDialog(prev => ({ ...prev, open }))}
        practitionerId={scheduleDialog.practitionerId}
        practitionerName={scheduleDialog.practitionerName}
      />

      <EditPractitionerDialog
        open={editDialog.open}
        onOpenChange={(open) => setEditDialog(prev => ({ ...prev, open }))}
        practitioner={editDialog.practitioner}
        onSaved={() => refetch()}
      />

      <AddPractitionerDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={() => refetch()}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the practitioner and remove them from booking selections. Their existing appointment history will be preserved. This can be reversed by an admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              disabled={deactivating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the practitioner and their login account. They will be removed from all bookings and services. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

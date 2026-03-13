import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScheduleEditor } from '@/components/practitioners/ScheduleEditor';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Clock } from 'lucide-react';
import { devLog } from '@/lib/logger';

export default function MySettingsPage() {
  const { user, loading: authLoading, rolesLoading } = useAuth();

  const { data: practitioner, isLoading } = useQuery({
    queryKey: ['my-practitioner-settings', user?.id],
    queryFn: async () => {
      devLog('Fetching practitioner for user:', user!.id);
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, email')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching practitioner:', error);
        throw error;
      }
      devLog('Practitioner query result:', data);
      return data;
    },
    enabled: !!user?.id && !authLoading && !rolesLoading,
  });

  if (authLoading || rolesLoading || isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!practitioner) {
    return (
      <MainLayout>
        <div className="space-y-6 max-w-4xl">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              My Settings
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage your schedule and calendar
            </p>
          </div>

          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No practitioner profile is linked to your account.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Please contact an administrator to set up your practitioner profile.
              </p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            My Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your availability schedule and Google Calendar sync
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Clock className="w-5 h-5 text-sage" />
              My Schedule & Calendar
            </CardTitle>
            <CardDescription>
              Set your weekly availability and connect your Google Calendar for two-way sync
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleEditor
              practitionerId={practitioner.id}
              practitionerName={practitioner.name}
            />
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

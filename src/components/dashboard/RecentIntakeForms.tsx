import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function RecentIntakeForms() {
  const navigate = useNavigate();

  const { data: responses = [], isLoading } = useQuery({
    queryKey: ['recent-intake-responses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intake_form_responses')
        .select('id, client_name, client_email, completed_at, created_at, template_id, intake_form_templates(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-sage" />
          Recent Intake Forms
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => navigate('/intake-forms')}>
          View All
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : responses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No intake form submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {responses.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.client_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {(r as any).intake_form_templates?.name || 'Unknown Form'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.completed_at ? (
                    <Badge variant="secondary" className="text-xs">Completed</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM d')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

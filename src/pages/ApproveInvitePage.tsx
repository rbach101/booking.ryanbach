import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';

export default function ApproveInvitePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing approval link.');
      return;
    }
    setStatus('form');
  }, [token]);

  const handleAction = async (actionType: 'approve' | 'reject') => {
    if (!token) return;
    setAction(actionType);
    try {
      const { data, error } = await supabase.functions.invoke('approve-invite', {
        body: { token, action: actionType },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setStatus('success');
      setMessage(
        actionType === 'approve'
          ? 'Invite approved. The user has been created and will receive their credentials via email.'
          : 'Invite rejected.'
      );
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setAction(null);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Approve Invite | Custom Booking</title>
      </Helmet>
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card rounded-xl border border-border shadow-sm p-6">
          {status === 'form' && (
            <>
              <h1 className="text-xl font-semibold text-foreground mb-2">Approve User Invite</h1>
              <p className="text-muted-foreground text-sm mb-6">
                A new user has been invited and needs your approval. Approving will create their account and send them their login credentials.
              </p>
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-sage hover:bg-sage/90 gap-2"
                  onClick={() => handleAction('approve')}
                  disabled={action !== null}
                >
                  {action === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {action === 'approve' ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => handleAction('reject')}
                  disabled={action !== null}
                >
                  {action === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  {action === 'reject' ? 'Rejecting...' : 'Reject'}
                </Button>
              </div>
            </>
          )}
          {status === 'success' && (
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-sage mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Done</h2>
              <p className="text-muted-foreground text-sm">{message}</p>
            </div>
          )}
          {status === 'error' && (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">Error</h2>
              <p className="text-muted-foreground text-sm">{message}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Check, UserPlus } from 'lucide-react';

interface InviteStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  practitionerId: string;
  practitionerName: string;
  practitionerEmail: string;
}

export function InviteStaffDialog({ 
  open, 
  onOpenChange, 
  practitionerId, 
  practitionerName,
  practitionerEmail 
}: InviteStaffDialogProps) {
  const [email, setEmail] = useState(practitionerEmail);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleInvite = async () => {
    if (!email) {
      toast.error('Email is required');
      return;
    }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('invite-user', {
        body: {
          email,
          name: practitionerName,
          role: 'staff',
          practitioner_id: practitionerId,
        },
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setSuccess(true);
      toast.success('Staff login created — welcome email sent!');
    } catch (error: unknown) {
      console.error('Invite error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create staff login');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-sage rounded-xl flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <DialogTitle className="text-center">Create Staff Login</DialogTitle>
          <DialogDescription className="text-center">
            {!success
              ? `Create a login account for ${practitionerName}. They'll be prompted to set their own password on first login.`
              : `Welcome email sent to ${practitionerName}!`}
          </DialogDescription>
        </DialogHeader>

        {!success ? (
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email Address</Label>
              <Input
                id="staff-email"
                type="email"
                placeholder="staff@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Pre-filled with practitioner's email. Change if needed.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="sage"
                className="flex-1"
                onClick={handleInvite}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Create Login'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium text-foreground">Welcome email sent!</p>
              <p className="text-sm text-muted-foreground">
                A welcome email has been sent to <strong>{email}</strong> with their login credentials, a quick-start guide, and everything they need to get started.
              </p>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>✅ Login credentials included</p>
              <p>✅ Step-by-step onboarding guide</p>
              <p>✅ They'll set their own password on first login</p>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="sage" onClick={handleClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

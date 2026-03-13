import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AddPractitionerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function AddPractitionerDialog({ open, onOpenChange, onCreated }: AddPractitionerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'staff' as 'staff' | 'admin',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    setLoading(true);

    try {
      // First create the practitioner record
      const { data: practitioner, error: practitionerError } = await supabase
        .from('practitioners')
        .insert({
          name: formData.name.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
        })
        .select()
        .single();

      if (practitionerError) throw practitionerError;

      // Then invite the user with the edge function
      const headers = await getEdgeFunctionHeaders();
      if (!headers.Authorization) {
        toast.error('Session expired. Please log in again.');
        return;
      }
      const response = await supabase.functions.invoke('invite-user', {
        headers,
        body: {
          email: formData.email.trim(),
          name: formData.name.trim(),
          role: formData.role,
          practitioner_id: practitioner.id,
        },
      });

      if (response.error || response.data?.error) {
        const msg = response.data?.error || await getFunctionErrorMessage(response.error) || 'Practitioner created but user invitation failed. You may need to invite them manually.';
        console.error('Invite error:', response.error || response.data?.error);
        
        // Clean up orphaned practitioner record if invite failed
        await supabase.from('practitioners').delete().eq('id', practitioner.id);
        
        toast.error(msg);
        return;
      }

      setStep('success');
      toast.success('Practitioner created — welcome email sent!');
      onCreated?.();
    } catch (error: unknown) {
      console.error('Error creating practitioner:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create practitioner');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('form');
    setFormData({ name: '', email: '', phone: '', role: 'staff' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {step === 'form' ? 'Add New Practitioner' : 'Practitioner Created!'}
          </DialogTitle>
          {step === 'form' && (
            <DialogDescription>
              Add a new practitioner and create their login credentials.
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'form' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="John Doe"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john@example.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="(808) 555-0123"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'staff' | 'admin') => setFormData(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="sage" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Practitioner'
                )}
              </Button>
            </div>
          </form>
        ) : (
        <div className="space-y-4">
            <div className="bg-muted/50 border border-border rounded-lg p-4 text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <p className="font-medium text-foreground">Welcome email sent!</p>
              <p className="text-sm text-muted-foreground">
                A welcome email has been sent to <strong>{formData.email}</strong> with their login credentials, a quick-start guide, and everything they need to get started.
              </p>
            </div>

            <div className="text-sm text-muted-foreground space-y-1">
              <p>✅ Login credentials included</p>
              <p>✅ Step-by-step onboarding guide</p>
              <p>✅ They'll set their own password on first login</p>
            </div>

            <div className="flex justify-end pt-4">
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

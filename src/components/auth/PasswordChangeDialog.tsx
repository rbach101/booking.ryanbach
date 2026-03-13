import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

interface PasswordChangeDialogProps {
  open: boolean;
  onPasswordChanged: () => void;
  forced?: boolean;
}

export function PasswordChangeDialog({ open, onPasswordChanged, forced = false }: PasswordChangeDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      passwordSchema.parse({ password, confirmPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { password?: string; confirmPassword?: string } = {};
        error.errors.forEach(err => {
          if (err.path[0] === 'password') fieldErrors.password = err.message;
          if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setLoading(true);
    
    try {
      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: { password_change_required: false }
      });

      if (updateError) throw updateError;

      toast.success('Password updated successfully!');
      onPasswordChanged();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen && !forced) onPasswordChanged(); }}>
      <DialogContent className="sm:max-w-md" data-password-change-dialog onPointerDownOutside={(e) => { if (forced) e.preventDefault(); }}>
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 bg-sage rounded-xl flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary-foreground" />
            </div>
          </div>
          <DialogTitle className="text-center">Set Your Password</DialogTitle>
          <DialogDescription className="text-center">
            Please set a new password for your account. This is required for your first login.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">{errors.confirmPassword}</p>
            )}
          </div>
          
          <Button 
            type="submit" 
            variant="sage" 
            className="w-full"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Password'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';
import { Loader2, Shield, KeyRound, Copy, Check, Users } from 'lucide-react';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';

const passwordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export function SecuritySettings() {
  const { isAdmin } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});

  // Staff reset state
  const [selectedPractitioner, setSelectedPractitioner] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch practitioners with login accounts
  const { data: practitioners } = useQuery({
    queryKey: ['practitioners-with-login'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('practitioners')
        .select('id, name, email, user_id')
        .not('user_id', 'is', null)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const handleUpdatePassword = async () => {
    setErrors({});
    try {
      passwordSchema.parse({ newPassword, confirmPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { newPassword?: string; confirmPassword?: string } = {};
        error.errors.forEach(err => {
          if (err.path[0] === 'newPassword') fieldErrors.newPassword = err.message;
          if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const handleResetStaffPassword = async () => {
    if (!selectedPractitioner) {
      toast.error('Please select a staff member');
      return;
    }

    const practitioner = practitioners?.find(p => p.id === selectedPractitioner);
    if (!practitioner?.user_id) return;

    setResettingPassword(true);
    setTempPassword(null);
    try {
      const headers = await getEdgeFunctionHeaders();
      const response = await supabase.functions.invoke('reset-staff-password', {
        headers,
        body: { user_id: practitioner.user_id },
      });

      if (response.error) throw new Error(await getFunctionErrorMessage(response.error));

      const result = response.data;
      if (result.success) {
        setTempPassword(result.temp_password);
        toast.success(`Password reset for ${practitioner.name}`);
      } else {
        throw new Error(result.error || 'Failed to reset password');
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      toast.success('Password copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Own password change */}
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Shield className="w-5 h-5 text-sage" />
            Your Password
          </CardTitle>
          <CardDescription>
            Update your own password
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {errors.newPassword && (
                <p className="text-sm text-destructive">{errors.newPassword}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={handleUpdatePassword} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Update Password
          </Button>
        </CardContent>
      </Card>

      {/* Admin: Reset staff password */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Users className="w-5 h-5 text-sage" />
              Reset Staff Password
            </CardTitle>
            <CardDescription>
              Reset a staff member's password and generate a temporary one
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="space-y-2">
                <Label>Staff Member</Label>
                <Select value={selectedPractitioner} onValueChange={(val) => { setSelectedPractitioner(val); setTempPassword(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    {practitioners?.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleResetStaffPassword}
                disabled={resettingPassword || !selectedPractitioner}
              >
                {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                Reset Password
              </Button>
            </div>

            {tempPassword && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Temporary Password</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono bg-background px-3 py-2 rounded border flex-1 break-all">{tempPassword}</code>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleCopyPassword}>
                    {copied ? <Check className="w-4 h-4 text-sage" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this with the staff member. They'll be prompted to set a new password on their next login.
                </p>
              </div>
            )}

            {practitioners?.length === 0 && (
              <p className="text-sm text-muted-foreground">No staff members with login accounts found.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
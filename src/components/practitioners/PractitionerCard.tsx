import { useState } from 'react';
import { Mail, Phone, Clock, Calendar, Pencil, UserPlus, KeyRound, Copy, Check, Trash2 } from 'lucide-react';
import { Practitioner, DayOfWeek } from '@/types/booking';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CSSProperties } from 'react';
import { InviteStaffDialog } from './InviteStaffDialog';
import { supabase } from '@/integrations/supabase/client';
import { getEdgeFunctionHeaders } from '@/lib/edgeFunctionHeaders';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { toast } from 'sonner';

interface PractitionerCardProps {
  practitioner: Practitioner;
  className?: string;
  style?: CSSProperties;
  onEditSchedule?: () => void;
  onEditInfo?: () => void;
  onDeactivate?: () => void;
  showInviteButton?: boolean;
}

const dayAbbreviations: Record<DayOfWeek, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

export function PractitionerCard({ practitioner, className, style, onEditSchedule, onEditInfo, onDeactivate, showInviteButton }: PractitionerCardProps) {
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleResetPassword = async () => {
    const userId = (practitioner as any).user_id;
    if (!userId) return;
    
    setResettingPassword(true);
    try {
      const headers = await getEdgeFunctionHeaders();
      const response = await supabase.functions.invoke('reset-staff-password', {
        headers,
        body: { user_id: userId },
      });

      if (response.error) throw new Error(await getFunctionErrorMessage(response.error));
      
      const result = response.data;
      if (result.success) {
        setTempPassword(result.temp_password);
        toast.success('Password reset successfully');
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
  
  const workingDays = (Object.keys(practitioner.availability) as DayOfWeek[]).filter(
    day => practitioner.availability[day].length > 0
  );

  // Check if practitioner already has a linked user account
  const hasUserAccount = !!(practitioner as any).user_id;

  return (
    <div 
      className={cn(
        "bg-card rounded-xl shadow-soft border border-border/50 overflow-hidden transition-all duration-300 hover:shadow-medium animate-scale-in",
        className
      )}
      style={style}
    >
      {/* Header with color accent */}
      <div 
        className="h-2"
        style={{ backgroundColor: practitioner.color }}
      />
      
      <div className="p-6">
        {/* Avatar and name */}
        <div className="flex items-start gap-4 mb-4">
          {practitioner.image ? (
            <img 
              src={practitioner.image}
              alt={practitioner.name}
              className="w-16 h-16 rounded-full object-cover shadow-soft"
            />
          ) : (
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-display font-semibold text-primary-foreground shadow-soft"
              style={{ backgroundColor: practitioner.color }}
            >
              {practitioner.name.split(' ').map(n => n[0]).join('')}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-lg font-semibold text-card-foreground truncate">
                {practitioner.name}
              </h3>
              {onEditInfo && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEditInfo}
                  className="h-8 w-8 flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {practitioner.specialties.slice(0, 3).map(specialty => (
                <Badge 
                  key={specialty} 
                  variant="secondary"
                  className="text-xs"
                >
                  {specialty}
                </Badge>
              ))}
              {practitioner.specialties.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{practitioner.specialties.length - 3}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {practitioner.bio && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {practitioner.bio}
          </p>
        )}

        {/* Contact info */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{practitioner.email}</span>
          </div>
          {practitioner.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-4 h-4 flex-shrink-0" />
              <span>{practitioner.phone}</span>
            </div>
          )}
        </div>

        {/* Availability */}
        <div className="pt-4 border-t border-border/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-card-foreground">Availability</span>
            </div>
            {onEditSchedule && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEditSchedule}
                className="gap-1 text-xs h-7"
              >
                <Calendar className="w-3 h-3" />
                Edit Schedule
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(dayAbbreviations) as DayOfWeek[]).map(day => {
              const isWorking = workingDays.includes(day);
              const slots = practitioner.availability[day];
              
              return (
                <div
                  key={day}
                  className={cn(
                    "w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs transition-colors",
                    isWorking 
                      ? "bg-sage-light text-sage font-medium" 
                      : "bg-muted text-muted-foreground"
                  )}
                  title={isWorking ? slots.map(s => `${s.start}-${s.end}`).join(', ') : 'Off'}
                >
                  <span>{dayAbbreviations[day]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite to Staff Login */}
        {showInviteButton && !hasUserAccount && (
          <div className="pt-4 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => setInviteDialogOpen(true)}
            >
              <UserPlus className="w-4 h-4" />
              Create Staff Login
            </Button>
          </div>
        )}

        {showInviteButton && hasUserAccount && (
          <div className="pt-4 border-t border-border/50 space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="gap-1">
                ✓ Has Login
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleResetPassword}
              disabled={resettingPassword}
            >
              <KeyRound className="w-4 h-4" />
              {resettingPassword ? 'Resetting...' : 'Reset Password'}
            </Button>
            {tempPassword && (
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Temporary password:</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono flex-1 break-all">{tempPassword}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopyPassword} aria-label={copied ? 'Copied' : 'Copy password'}>
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Share this with the staff member. They'll be prompted to change it on login.</p>
              </div>
            )}
          </div>
        )}

        {/* Deactivate (admin only) */}
        {onDeactivate && (
          <div className="pt-4 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDeactivate}
            >
              <Trash2 className="w-4 h-4" />
              Remove Practitioner
            </Button>
          </div>
        )}
      </div>

      <InviteStaffDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        practitionerId={practitioner.id}
        practitionerName={practitioner.name}
        practitionerEmail={practitioner.email}
      />
    </div>
  );
}

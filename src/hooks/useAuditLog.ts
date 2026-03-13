import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type ResourceType = 'soap_note' | 'customer' | 'booking' | 'intake_form' | 'practitioner';
type AuditAction = 'view' | 'create' | 'update' | 'delete';

interface AuditLogParams {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string;
  details?: Record<string, unknown>;
}

export function useAuditLog() {
  const { user } = useAuth();

  const logAction = useCallback(async ({ action, resourceType, resourceId, details }: AuditLogParams) => {
    if (!user) return;

    try {
      await (supabase.from('audit_logs') as any).insert({
        user_id: user.id,
        user_email: user.email || null,
        action,
        resource_type: resourceType,
        resource_id: resourceId || null,
        details: details || {},
      });
    } catch (err) {
      // Silently fail — audit logging should never break the app
      console.error('Audit log error:', err);
    }
  }, [user]);

  return { logAction };
}

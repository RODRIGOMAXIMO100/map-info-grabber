import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

export function useActivityTracking() {
  const { user } = useAuth();

  const logActivity = useCallback(async (action: string, metadata: Json = {}) => {
    if (!user?.id) return;

    try {
      await supabase.from('user_activity_logs').insert([{
        user_id: user.id,
        action,
        metadata,
      }]);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }, [user?.id]);

  // Log page view on mount
  useEffect(() => {
    if (user?.id) {
      logActivity('page_view', { path: window.location.pathname });
    }
  }, [user?.id, logActivity]);

  return { logActivity };
}

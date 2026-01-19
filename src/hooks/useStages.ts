import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CRMFunnelStage } from '@/types/crm';

export function useStages(funnelId: string | null) {
  return useQuery({
    queryKey: ['stages', funnelId],
    queryFn: async () => {
      if (!funnelId) return [];
      
      const { data, error } = await supabase
        .from('crm_funnel_stages')
        .select('id, funnel_id, name, color, stage_order, is_ai_controlled')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: true });

      if (error) throw error;
      return (data || []) as CRMFunnelStage[];
    },
    enabled: !!funnelId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useClosedStage(funnelId: string | null) {
  const { data: stages } = useStages(funnelId);
  
  return stages?.find(stage => 
    stage.name.toLowerCase().includes('fechado') ||
    stage.name.toLowerCase().includes('convertido') ||
    stage.name.toLowerCase().includes('won') ||
    stage.name.toLowerCase().includes('ganho')
  ) || null;
}

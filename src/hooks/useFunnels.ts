import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CRMFunnel } from '@/types/crm';

export function useFunnels() {
  return useQuery({
    queryKey: ['funnels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_funnels')
        .select('id, name, description, is_default, created_at')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as CRMFunnel[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useDefaultFunnel() {
  const { data: funnels, ...rest } = useFunnels();
  
  const defaultFunnel = funnels?.find(f => f.is_default) || funnels?.[0] || null;
  
  return {
    ...rest,
    data: defaultFunnel,
    funnels,
  };
}

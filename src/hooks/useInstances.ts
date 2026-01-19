import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppInstance {
  id: string;
  name: string;
  color: string;
  instance_phone: string;
  is_active: boolean;
  broadcast_enabled: boolean;
}

export function useInstances() {
  return useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('id, name, color, instance_phone, is_active, broadcast_enabled')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      return (data || []).map(d => ({
        id: d.id,
        name: d.name || 'Principal',
        color: d.color || '#10B981',
        instance_phone: d.instance_phone || '',
        is_active: d.is_active ?? true,
        broadcast_enabled: d.broadcast_enabled ?? true,
      })) as WhatsAppInstance[];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useActiveInstances() {
  const { data: instances, ...rest } = useInstances();
  
  return {
    ...rest,
    data: instances?.filter(i => i.is_active) || [],
  };
}

export function useBroadcastInstances() {
  const { data: instances, ...rest } = useInstances();
  
  return {
    ...rest,
    data: instances?.filter(i => i.is_active && i.broadcast_enabled) || [],
  };
}

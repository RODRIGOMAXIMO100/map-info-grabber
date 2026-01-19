import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  user_id: string;
  full_name: string;
}

export function useProfiles(userIds: string[]) {
  return useQuery({
    queryKey: ['profiles', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      if (error) throw error;
      
      const profileMap: Record<string, string> = {};
      (data || []).forEach((p: Profile) => {
        profileMap[p.user_id] = p.full_name;
      });
      
      return profileMap;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

export function useTeamUsers() {
  return useQuery({
    queryKey: ['team-users'],
    queryFn: async () => {
      // Load roles (SDR and Closer only)
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['sdr', 'closer']);

      if (rolesError) throw rolesError;

      const userIds = (roles || []).map(r => r.user_id);
      if (userIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Combine data
      return (roles || []).map(role => {
        const profile = profiles?.find(p => p.user_id === role.user_id);
        return {
          user_id: role.user_id,
          full_name: profile?.full_name || 'Usuário',
          role: role.role,
        };
      }).sort((a, b) => {
        const order: Record<string, number> = { sdr: 1, closer: 2 };
        return (order[a.role] || 99) - (order[b.role] || 99);
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

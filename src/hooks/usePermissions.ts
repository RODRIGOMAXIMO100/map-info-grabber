import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Permission {
  route_key: string;
  route_label: string;
  is_allowed: boolean;
}

interface RolePermission {
  role: 'admin' | 'sdr' | 'closer';
  route_key: string;
  route_label: string;
  is_allowed: boolean;
}

export function usePermissions() {
  const { role, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) {
      // Admin tem acesso a tudo
      setPermissions([]);
      setLoading(false);
      return;
    }

    if (!role || role === 'admin') {
      setLoading(false);
      return;
    }

    loadPermissions();
  }, [role, isAdmin]);

  const loadPermissions = async () => {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('route_key, route_label, is_allowed')
        .eq('role', role as 'admin' | 'sdr' | 'closer');

      if (error) {
        console.error('Error loading permissions:', error);
        setPermissions([]);
      } else {
        setPermissions(data || []);
      }
    } catch (err) {
      console.error('Error loading permissions:', err);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const hasAccess = useCallback((routeKey: string): boolean => {
    if (isAdmin) return true;
    if (!role) return false;
    const perm = permissions.find(p => p.route_key === routeKey);
    return perm?.is_allowed ?? false;
  }, [isAdmin, role, permissions]);

  return { permissions, loading, hasAccess };
}

// Hook para gerenciamento de permissões (admin only)
export function usePermissionsAdmin() {
  const [allPermissions, setAllPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const loadAllPermissions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('route_label');

      if (error) {
        console.error('Error loading all permissions:', error);
        setAllPermissions([]);
      } else {
        setAllPermissions(data?.map(p => ({
          role: p.role as 'admin' | 'sdr' | 'closer',
          route_key: p.route_key,
          route_label: p.route_label,
          is_allowed: p.is_allowed
        })) || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = async (role: 'sdr' | 'closer', routeKey: string, isAllowed: boolean) => {
    try {
      setUpdating(`${role}-${routeKey}`);
      
      const { error } = await supabase
        .from('role_permissions')
        .update({ is_allowed: isAllowed, updated_at: new Date().toISOString() })
        .eq('role', role as 'admin' | 'sdr' | 'closer')
        .eq('route_key', routeKey);

      if (error) throw error;

      // Update local state
      setAllPermissions(prev => 
        prev.map(p => 
          p.role === role && p.route_key === routeKey 
            ? { ...p, is_allowed: isAllowed }
            : p
        )
      );

      return true;
    } catch (err) {
      console.error('Error updating permission:', err);
      return false;
    } finally {
      setUpdating(null);
    }
  };

  useEffect(() => {
    loadAllPermissions();
  }, []);

  // Group permissions by route
  const permissionsByRoute = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.route_key]) {
      acc[perm.route_key] = {
        route_key: perm.route_key,
        route_label: perm.route_label,
        sdr: false,
        closer: false
      };
    }
    if (perm.role === 'sdr') acc[perm.route_key].sdr = perm.is_allowed;
    if (perm.role === 'closer') acc[perm.route_key].closer = perm.is_allowed;
    return acc;
  }, {} as Record<string, { route_key: string; route_label: string; sdr: boolean; closer: boolean }>);

  return { 
    allPermissions, 
    permissionsByRoute: Object.values(permissionsByRoute),
    loading, 
    updating,
    updatePermission, 
    refresh: loadAllPermissions 
  };
}

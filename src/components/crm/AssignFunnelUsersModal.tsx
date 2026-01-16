import { useState, useEffect } from 'react';
import { Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  user_id: string;
  full_name: string;
  role?: string;
}

interface AssignFunnelUsersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnelId: string;
  funnelName: string;
  onSaved?: () => void;
}

export function AssignFunnelUsersModal({
  open,
  onOpenChange,
  funnelId,
  funnelName,
  onSaved,
}: AssignFunnelUsersModalProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [assignedUserIds, setAssignedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, funnelId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all non-admin users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      // Load user roles to identify non-admins
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Create a map of user_id to role
      const roleMap: Record<string, string> = {};
      rolesData?.forEach((r) => {
        roleMap[r.user_id] = r.role;
      });

      // Filter to only show SDR and Closer users (not admins)
      const filteredUsers = (profilesData || [])
        .map((p) => ({ ...p, role: roleMap[p.user_id] || 'user' }))
        .filter((p) => p.role !== 'admin');

      setUsers(filteredUsers);

      // Load current assignments for this funnel
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('crm_funnel_users')
        .select('user_id')
        .eq('funnel_id', funnelId);

      if (assignmentsError) throw assignmentsError;

      setAssignedUserIds(new Set(assignmentsData?.map((a) => a.user_id) || []));
    } catch (error) {
      console.error('Error loading data:', error);
      toast({ title: 'Erro ao carregar usuários', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const toggleUser = (userId: string) => {
    setAssignedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Delete all current assignments for this funnel
      const { error: deleteError } = await supabase
        .from('crm_funnel_users')
        .delete()
        .eq('funnel_id', funnelId);

      if (deleteError) throw deleteError;

      // Insert new assignments
      if (assignedUserIds.size > 0) {
        const inserts = Array.from(assignedUserIds).map((userId) => ({
          funnel_id: funnelId,
          user_id: userId,
        }));

        const { error: insertError } = await supabase
          .from('crm_funnel_users')
          .insert(inserts);

        if (insertError) throw insertError;
      }

      toast({ title: 'Atribuições salvas!' });
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast({ title: 'Erro ao salvar atribuições', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'sdr':
        return 'SDR';
      case 'closer':
        return 'Closer';
      default:
        return 'Usuário';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Atribuir Usuários
          </DialogTitle>
          <DialogDescription>
            Selecione os usuários que terão acesso ao funil "{funnelName}"
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhum usuário (SDR/Closer) cadastrado
            </p>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {users.map((user) => (
                <label
                  key={user.user_id}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={assignedUserIds.has(user.user_id)}
                    onCheckedChange={() => toggleUser(user.user_id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {getRoleLabel(user.role)}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

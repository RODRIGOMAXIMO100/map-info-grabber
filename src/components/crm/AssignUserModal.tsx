import { useState, useEffect } from 'react';
import { Loader2, User, UserCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface UserWithRole {
  user_id: string;
  full_name: string;
  role: 'admin' | 'sdr' | 'closer';
}

interface AssignUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  currentAssignedTo?: string | null;
  onSuccess: () => void;
}

export function AssignUserModal({
  open,
  onOpenChange,
  leadId,
  leadName,
  currentAssignedTo,
  onSuccess,
}: AssignUserModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadUsers();
      setSelectedUserId(null);
    }
  }, [open]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      // Fetch all users with roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Get profile info for users with roles
      const userIds = roles.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Combine data - filter out admins (they should not receive leads)
      const usersWithRoles: UserWithRole[] = (roles || [])
        .filter(role => role.role !== 'admin')
        .map(role => {
          const profile = profiles?.find(p => p.user_id === role.user_id);
          return {
            user_id: role.user_id,
            full_name: profile?.full_name || 'Usuário',
            role: role.role as 'admin' | 'sdr' | 'closer',
          };
        })
        .sort((a, b) => {
          // Sort: SDR first, then Closer
          const order = { sdr: 1, closer: 2, admin: 3 };
          return order[a.role] - order[b.role];
        });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
      toast({
        title: 'Erro ao carregar usuários',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedUserId) return;

    setAssigning(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({
          assigned_to: selectedUserId,
          assigned_at: new Date().toISOString(),
          transferred_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;

      const assignedUser = users.find(u => u.user_id === selectedUserId);
      toast({
        title: 'Lead atribuído',
        description: `${leadName} foi atribuído para ${assignedUser?.full_name}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error assigning lead:', error);
      toast({
        title: 'Erro ao atribuir lead',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({
          assigned_to: null,
          assigned_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;

      toast({
        title: 'Atribuição removida',
        description: `${leadName} não está mais atribuído a nenhum vendedor`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Error unassigning lead:', error);
      toast({
        title: 'Erro ao remover atribuição',
        variant: 'destructive',
      });
    } finally {
      setAssigning(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="default" className="text-[10px]">Admin</Badge>;
      case 'sdr':
        return <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">SDR</Badge>;
      case 'closer':
        return <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Closer</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Atribuir Vendedor
          </DialogTitle>
          <DialogDescription>
            Selecione um vendedor para atribuir o lead "{leadName}"
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum vendedor disponível
          </div>
        ) : (
          <RadioGroup
            value={selectedUserId || ''}
            onValueChange={setSelectedUserId}
            className="space-y-2 max-h-60 overflow-y-auto"
          >
            {users.map((u) => (
              <div
                key={u.user_id}
                className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedUserId === u.user_id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                } ${currentAssignedTo === u.user_id ? 'ring-2 ring-primary/30' : ''}`}
                onClick={() => setSelectedUserId(u.user_id)}
              >
                <RadioGroupItem value={u.user_id} id={u.user_id} />
                <Label
                  htmlFor={u.user_id}
                  className="flex-1 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{u.full_name}</span>
                    {currentAssignedTo === u.user_id && (
                      <Badge variant="outline" className="text-[9px]">Atual</Badge>
                    )}
                  </div>
                  {getRoleBadge(u.role)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {currentAssignedTo && (
            <Button
              variant="outline"
              onClick={handleUnassign}
              disabled={assigning}
              className="w-full sm:w-auto"
            >
              Remover Atribuição
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={assigning}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAssign}
              disabled={!selectedUserId || assigning || selectedUserId === currentAssignedTo}
              className="flex-1"
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atribuir'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

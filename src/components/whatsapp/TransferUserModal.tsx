import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, UserCheck, Send } from 'lucide-react';

interface UserWithRole {
  user_id: string;
  full_name: string;
  role: 'admin' | 'sdr' | 'closer';
}

interface TransferUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationName: string;
  currentAssignedTo: string | null;
  onTransferComplete: () => void;
}

export const TransferUserModal = ({
  open,
  onOpenChange,
  conversationId,
  conversationName,
  currentAssignedTo,
  onTransferComplete,
}: TransferUserModalProps) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendNotification, setSendNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState(
    'Sua conversa foi transferida para outro atendente. Em breve você será atendido!'
  );

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Fetch profiles with roles (only users with roles)
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

      // Combine data, excluding current user and current assignee
      const usersWithRoles: UserWithRole[] = (roles || [])
        .filter(r => r.user_id !== user?.id && r.user_id !== currentAssignedTo)
        .map(role => {
          const profile = profiles?.find(p => p.user_id === role.user_id);
          return {
            user_id: role.user_id,
            full_name: profile?.full_name || 'Usuário',
            role: role.role as 'admin' | 'sdr' | 'closer',
          };
        });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedUserId) {
      toast.error('Selecione um usuário');
      return;
    }

    try {
      setTransferring(true);

      // Update conversation assignment
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({
          assigned_to: selectedUserId,
          assigned_at: new Date().toISOString(),
          transferred_by: user?.id,
        })
        .eq('id', conversationId);

      if (error) throw error;

      // Send notification if enabled
      if (sendNotification) {
        const { data: conversation } = await supabase
          .from('whatsapp_conversations')
          .select('phone, config_id')
          .eq('id', conversationId)
          .single();

        if (conversation?.config_id) {
          await supabase.functions.invoke('whatsapp-send-message', {
            body: {
              configId: conversation.config_id,
              phone: conversation.phone,
              message: notificationMessage,
            },
          });
        }
      }

      const selectedUser = users.find(u => u.user_id === selectedUserId);
      toast.success(`Conversa transferida para ${selectedUser?.full_name}`);
      onTransferComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error transferring conversation:', error);
      toast.error('Erro ao transferir conversa');
    } finally {
      setTransferring(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500 hover:bg-red-600 text-xs">Admin</Badge>;
      case 'sdr':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-xs">SDR</Badge>;
      case 'closer':
        return <Badge className="bg-green-500 hover:bg-green-600 text-xs">Closer</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Transferir Conversa
          </DialogTitle>
          <DialogDescription>
            Transferir "{conversationName}" para outro vendedor
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhum outro vendedor disponível
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Selecione o vendedor</Label>
                <RadioGroup
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  className="space-y-2"
                >
                  {users.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center space-x-3 border rounded-lg p-3 hover:bg-muted/50 cursor-pointer"
                    >
                      <RadioGroupItem value={u.user_id} id={u.user_id} />
                      <Label
                        htmlFor={u.user_id}
                        className="flex-1 cursor-pointer flex items-center justify-between"
                      >
                        <span>{u.full_name}</span>
                        {getRoleBadge(u.role)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendNotification"
                    checked={sendNotification}
                    onCheckedChange={(checked) => setSendNotification(!!checked)}
                  />
                  <Label htmlFor="sendNotification" className="text-sm cursor-pointer">
                    Notificar o contato sobre a transferência
                  </Label>
                </div>
                
                {sendNotification && (
                  <Textarea
                    placeholder="Mensagem de notificação..."
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    rows={3}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedUserId || transferring || users.length === 0}
          >
            {transferring ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

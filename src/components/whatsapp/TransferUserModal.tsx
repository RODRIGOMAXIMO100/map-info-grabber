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

interface UserInfo {
  user_id: string;
  full_name: string;
  role?: 'admin' | 'sdr' | 'closer' | null;
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
  const { user, session, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
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

      // Busca TODOS os perfis cadastrados (não depende de user_roles)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Busca roles opcionalmente para exibir badge
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      // Monta lista excluindo usuário logado e o atualmente atribuído
      const userList: UserInfo[] = profiles
        .filter(p => p.user_id !== user?.id && p.user_id !== currentAssignedTo)
        .map(profile => {
          const roleInfo = roles?.find(r => r.user_id === profile.user_id);
          return {
            user_id: profile.user_id,
            full_name: profile.full_name || 'Usuário',
            role: roleInfo?.role as 'admin' | 'sdr' | 'closer' | null,
          };
        });

      setUsers(userList);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (authLoading) {
      toast.error('Carregando sua sessão… tente novamente em alguns segundos.');
      return;
    }

    if (!user) {
      toast.error('Você precisa estar logado para transferir.');
      return;
    }

    if (!selectedUserId) {
      toast.error('Selecione um usuário');
      return;
    }

    // Força refresh da sessão antes de qualquer operação (evita token expirado)
    await supabase.auth.refreshSession();
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const hasSession = !!sessionData?.session;

    console.debug('[TransferUserModal] preflight', {
      conversationId,
      selectedUserId,
      userId: user.id,
      authLoading,
      contextSession: !!session,
      hasSession,
      sessionError: sessionError?.message,
    });

    if (!hasSession) {
      toast.error('Sessão expirada. Atualize a página e faça login novamente.');
      return;
    }

    try {
      setTransferring(true);

      // IMPORTANTE: Buscar phone/config_id ANTES do update (enquanto ainda temos permissão)
      let conversationData: { phone: string; config_id: string | null } | null = null;
      if (sendNotification) {
        const { data, error: fetchError } = await supabase
          .from('whatsapp_conversations')
          .select('phone, config_id')
          .eq('id', conversationId)
          .single();

        if (fetchError) {
          console.error('Error fetching conversation for notification:', fetchError);
          toast.error('Erro ao buscar dados da conversa para notificação');
          setTransferring(false);
          return;
        }
        conversationData = data;
      }

      // Update conversation assignment
      // IMPORTANTE: não fazemos `select()` aqui porque após transferir o usuário pode perder
      // permissão de SELECT (e o PostgREST pode falhar ao tentar retornar a linha atualizada).
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({
          assigned_to: selectedUserId,
          assigned_at: new Date().toISOString(),
          transferred_by: user.id,
        })
        .eq('id', conversationId);

      if (updateError) {
        console.error('Error transferring conversation:', updateError);

        if (updateError.code === '42501') {
          toast.error('Sem permissão/sessão para transferir. Atualize a página e faça login novamente.');
        } else {
          const errorDetails = [
            updateError.message,
            updateError.code && `Código: ${updateError.code}`,
            updateError.details && `Detalhes: ${updateError.details}`,
            updateError.hint && `Dica: ${updateError.hint}`,
          ]
            .filter(Boolean)
            .join(' | ');

          toast.error(`Erro ao transferir: ${errorDetails}`);
        }

        setTransferring(false);
        return;
      }

      // Send notification if enabled (usando dados pré-buscados)
      if (sendNotification && conversationData?.config_id) {
        try {
          await supabase.functions.invoke('whatsapp-send-message', {
            body: {
              configId: conversationData.config_id,
              phone: conversationData.phone,
              message: notificationMessage,
            },
          });
        } catch (notifyError) {
          console.error('Error sending notification:', notifyError);
          // Não bloquear a transferência por causa da notificação
          toast.warning('Conversa transferida, mas não foi possível enviar a notificação');
        }
      }

      const selectedUser = users.find(u => u.user_id === selectedUserId);
      toast.success(`Conversa transferida para ${selectedUser?.full_name}`);
      onTransferComplete();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error transferring conversation:', error);
      const supabaseError = error as { message?: string; code?: string; details?: string; hint?: string };
      const errorDetails = [
        supabaseError.message || 'Erro desconhecido',
        supabaseError.code && `Código: ${supabaseError.code}`,
        supabaseError.details && `Detalhes: ${supabaseError.details}`,
        supabaseError.hint && `Dica: ${supabaseError.hint}`,
      ]
        .filter(Boolean)
        .join(' | ');

      toast.error(`Erro ao transferir: ${errorDetails}`);
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
            disabled={authLoading || !user || !selectedUserId || transferring || users.length === 0}
            title={!user ? 'Faça login para transferir' : undefined}
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

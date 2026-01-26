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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, UserCheck, Send, GitFork, GitBranch } from 'lucide-react';

interface UserInfo {
  user_id: string;
  full_name: string;
  role?: 'admin' | 'sdr' | 'closer' | null;
}

interface FunnelOption {
  id: string;
  name: string;
  is_default: boolean | null;
}

interface StageOption {
  id: string;
  name: string;
  color: string | null;
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
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sendNotification, setSendNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState(
    'Sua conversa foi transferida para outro atendente. Em breve você será atendido!'
  );

  // Funnel/Stage states
  const [funnels, setFunnels] = useState<FunnelOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [loadingStages, setLoadingStages] = useState(false);

  useEffect(() => {
    if (open) {
      loadUsers();
      loadFunnels();
      // Reset funnel/stage selection when modal opens
      setSelectedFunnelId(null);
      setSelectedStageId(null);
      setStages([]);
    }
  }, [open]);

  // Load stages when funnel changes
  useEffect(() => {
    if (selectedFunnelId) {
      loadStages(selectedFunnelId);
      setSelectedStageId(null);
    } else {
      setStages([]);
      setSelectedStageId(null);
    }
  }, [selectedFunnelId]);

  const loadUsers = async () => {
    try {
      setLoading(true);

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      if (profilesError) throw profilesError;

      if (!profiles || profiles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role');

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

  const loadFunnels = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_funnels')
        .select('id, name, is_default')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setFunnels(data || []);
    } catch (error) {
      console.error('Error loading funnels:', error);
    }
  };

  const loadStages = async (funnelId: string) => {
    try {
      setLoadingStages(true);
      const { data, error } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, color')
        .eq('funnel_id', funnelId)
        .order('stage_order');

      if (error) throw error;
      setStages(data || []);
    } catch (error) {
      console.error('Error loading stages:', error);
    } finally {
      setLoadingStages(false);
    }
  };

  const handleTransfer = async () => {
    console.log('[TransferUserModal] === INÍCIO TRANSFERÊNCIA ===');
    console.log('[TransferUserModal] conversationId:', conversationId);
    console.log('[TransferUserModal] selectedUserId:', selectedUserId);
    console.log('[TransferUserModal] selectedFunnelId:', selectedFunnelId);
    console.log('[TransferUserModal] selectedStageId:', selectedStageId);

    if (authLoading) {
      toast.error('Carregando sua sessão… tente novamente em alguns segundos.');
      return;
    }

    if (!user) {
      console.error('[TransferUserModal] ERRO: Usuário não logado');
      toast.error('Você precisa estar logado para transferir.');
      return;
    }

    if (!selectedUserId) {
      toast.error('Selecione um usuário');
      return;
    }

    // If funnel is selected, stage must also be selected
    if (selectedFunnelId && !selectedStageId) {
      toast.error('Selecione a etapa do funil');
      return;
    }

    // Refresh session
    console.log('[TransferUserModal] Refreshing session...');
    const refreshResult = await supabase.auth.refreshSession();
    console.log('[TransferUserModal] Refresh result:', refreshResult.error?.message || 'OK');
    
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const hasSession = !!sessionData?.session;

    console.log('[TransferUserModal] Session check:', {
      hasSession,
      sessionError: sessionError?.message,
    });

    if (!hasSession) {
      toast.error('Sessão expirada. Atualize a página e faça login novamente.');
      return;
    }

    try {
      setTransferring(true);

      // Fetch phone/config_id BEFORE update
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

      // Build update data
      const updateData: Record<string, unknown> = {
        assigned_to: selectedUserId,
        assigned_at: new Date().toISOString(),
        transferred_by: user.id,
      };

      // Add funnel and stage if selected
      if (selectedFunnelId) {
        updateData.crm_funnel_id = selectedFunnelId;
        if (selectedStageId) {
          updateData.funnel_stage = selectedStageId;
          updateData.funnel_stage_changed_at = new Date().toISOString();
        }
      }

      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversationId);

      if (updateError) {
        console.error('Error transferring conversation:', updateError);

        if (updateError.code === '42501') {
          toast.error('Sem permissão/sessão para transferir. Atualize a página e faça login novamente.');
        } else {
          const errorDetails = [
            updateError.message,
            updateError.code && `Código: ${updateError.code}`,
          ]
            .filter(Boolean)
            .join(' | ');

          toast.error(`Erro ao transferir: ${errorDetails}`);
        }

        setTransferring(false);
        return;
      }

      // Send notification if enabled
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
          toast.warning('Conversa transferida, mas não foi possível enviar a notificação');
        }
      }

      const selectedUser = users.find(u => u.user_id === selectedUserId);
      const selectedStage = stages.find(s => s.id === selectedStageId);
      
      let successMessage = `Conversa transferida para ${selectedUser?.full_name}`;
      if (selectedStage) {
        successMessage += ` na etapa "${selectedStage.name}"`;
      }
      
      toast.success(successMessage);
      onTransferComplete();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error('Error transferring conversation:', error);
      const supabaseError = error as { message?: string; code?: string };
      toast.error(`Erro ao transferir: ${supabaseError.message || 'Erro desconhecido'}`);
    } finally {
      setTransferring(false);
    }
  };

  const getRoleBadge = (role: string | null | undefined) => {
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
              {/* User Selection */}
              <div className="space-y-2">
                <Label>Selecione o vendedor</Label>
                <RadioGroup
                  value={selectedUserId}
                  onValueChange={setSelectedUserId}
                  className="space-y-2 max-h-40 overflow-y-auto"
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

              {/* Funnel Selection */}
              <div className="space-y-2 pt-2 border-t">
                <Label className="flex items-center gap-2">
                  <GitFork className="h-4 w-4" />
                  Funil (opcional)
                </Label>
                <Select
                  value={selectedFunnelId || 'keep'}
                  onValueChange={(value) => setSelectedFunnelId(value === 'keep' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Manter funil atual" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Manter funil atual</SelectItem>
                    {funnels.map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        {funnel.name} {funnel.is_default && '(padrão)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage Selection */}
              {selectedFunnelId && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4" />
                    Etapa do Funil
                  </Label>
                  {loadingStages ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando etapas...
                    </div>
                  ) : stages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma etapa encontrada</p>
                  ) : (
                    <Select
                      value={selectedStageId || ''}
                      onValueChange={setSelectedStageId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: stage.color || '#6366f1' }} 
                              />
                              {stage.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Notification */}
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
            disabled={
              authLoading || 
              !user || 
              !selectedUserId || 
              transferring || 
              users.length === 0 ||
              (selectedFunnelId && !selectedStageId)
            }
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

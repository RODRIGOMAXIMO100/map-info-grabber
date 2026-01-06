import { Bot, BotOff, Loader2, Radio, Megaphone, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

interface Funnel {
  id: string;
  name: string;
  is_default: boolean;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  stage_order: number;
}

interface LeadControlPanelProps {
  conversation: {
    id: string;
    ai_paused?: boolean;
    ai_handoff_reason?: string | null;
    is_group?: boolean;
    is_crm_lead?: boolean;
    origin?: string | null;
    funnel_stage?: string | null;
    crm_funnel_id?: string | null;
    tags?: string[];
  };
  onUpdate?: () => void;
  onDelete?: () => void;
}

const ORIGINS = [
  { id: 'random', label: 'Aleatório', icon: Radio },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone }
];

export function LeadControlPanel({ conversation, onUpdate, onDelete }: LeadControlPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);

  const isInHandoff = conversation.tags?.includes('21') || conversation.tags?.includes('23');
  const isAiActive = conversation.is_crm_lead && !conversation.ai_paused && !conversation.is_group && !isInHandoff;
  const currentOrigin = conversation.origin || 'random';
  const currentFunnelId = conversation.crm_funnel_id || '';
  const currentStage = conversation.funnel_stage || '';
  const isCrmLead = conversation.is_crm_lead === true;

  // Load funnels on mount
  useEffect(() => {
    const loadFunnels = async () => {
      const { data } = await supabase
        .from('crm_funnels')
        .select('id, name, is_default')
        .order('is_default', { ascending: false });
      setFunnels(data || []);
    };
    loadFunnels();
  }, []);

  // Load stages when funnel changes
  useEffect(() => {
    const loadStages = async () => {
      if (!currentFunnelId) {
        setStages([]);
        return;
      }
      const { data } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, color, stage_order')
        .eq('funnel_id', currentFunnelId)
        .order('stage_order', { ascending: true });
      setStages(data || []);
    };
    loadStages();
  }, [currentFunnelId]);

  const handleToggleAI = async () => {
    if (conversation.is_group) return;
    
    setLoading(true);
    try {
      const newPausedState = !conversation.ai_paused;
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: newPausedState,
          ai_handoff_reason: newPausedState ? 'Pausado manualmente' : null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: newPausedState ? 'IA Pausada' : 'IA Ativada',
        description: newPausedState 
          ? 'A IA não responderá automaticamente.' 
          : 'A IA voltará a responder.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar status da IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLead = async () => {
    if (conversation.is_group) return;
    
    setLoading(true);
    try {
      const newLeadState = !conversation.is_crm_lead;
      
      let updateData: Record<string, unknown> = {
        is_crm_lead: newLeadState,
        ai_paused: newLeadState ? false : true
      };

      if (newLeadState) {
        // Get default funnel and first stage
        const { data: defaultFunnel } = await supabase
          .from('crm_funnels')
          .select('id')
          .eq('is_default', true)
          .single();

        if (defaultFunnel) {
          const { data: firstStage } = await supabase
            .from('crm_funnel_stages')
            .select('id')
            .eq('funnel_id', defaultFunnel.id)
            .order('stage_order', { ascending: true })
            .limit(1)
            .single();

          updateData.crm_funnel_id = defaultFunnel.id;
          updateData.funnel_stage = firstStage?.id || null;
        }
      } else {
        updateData.crm_funnel_id = null;
        updateData.funnel_stage = null;
      }

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: newLeadState ? 'Lead Ativado' : 'Lead Desativado',
        description: newLeadState 
          ? 'A IA começará a responder.' 
          : 'Esta conversa não é mais um lead.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error toggling lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar status do lead.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFunnelChange = async (funnelId: string) => {
    setLoading(true);
    try {
      // Get first stage of new funnel
      const { data: firstStage } = await supabase
        .from('crm_funnel_stages')
        .select('id')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: true })
        .limit(1)
        .single();

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          crm_funnel_id: funnelId,
          funnel_stage: firstStage?.id || null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Funil atualizado' });
      onUpdate?.();
    } catch (error) {
      console.error('Error updating funnel:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar funil.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOriginChange = async (value: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ origin: value })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Origem atualizada' });
      onUpdate?.();
    } catch (error) {
      console.error('Error updating origin:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar origem.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (value: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ funnel_stage: value })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Etapa atualizada' });
      onUpdate?.();
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar etapa.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResumeFromHandoff = async () => {
    setLoading(true);
    try {
      const currentTags: string[] = conversation.tags || [];
      const filteredTags = currentTags.filter(tag => tag !== '21' && tag !== '23');
      const newTags = [...new Set([...filteredTags, '20'])];

      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          tags: newTags,
          funnel_stage: 'negotiating',
          ai_paused: false,
          ai_handoff_reason: null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: 'IA Retomada',
        description: 'Lead devolvido para a IA.',
      });
      onUpdate?.();
    } catch (error) {
      console.error('Error resuming from handoff:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível retomar a IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async () => {
    setLoading(true);
    try {
      // First delete AI logs (foreign key constraint)
      const { error: logsError } = await supabase
        .from('whatsapp_ai_logs')
        .delete()
        .eq('conversation_id', conversation.id);

      if (logsError) throw logsError;

      // Then delete all messages
      const { error: messagesError } = await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('conversation_id', conversation.id);

      if (messagesError) throw messagesError;

      // Finally delete the conversation
      const { error: conversationError } = await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('id', conversation.id);

      if (conversationError) throw conversationError;

      toast({
        title: 'Conversa deletada',
        description: 'A conversa e todas as mensagens foram removidas.',
      });
      
      onDelete?.();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar a conversa.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't show controls for groups
  if (conversation.is_group) {
    return (
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Bot className="h-4 w-4" />
          <span className="text-sm">Grupos não são atendidos pela IA</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-3">
      {/* Handoff Resume Button */}
      {isInHandoff && (
        <div className="flex items-center justify-between gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-md">
          <div className="flex items-center gap-2 text-amber-600">
            <BotOff className="h-4 w-4" />
            <span className="text-sm font-medium">Handoff - Aguardando Vendedor</span>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={handleResumeFromHandoff}
            disabled={loading}
            className="text-xs h-7 gap-1 bg-amber-600 hover:bg-amber-700"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
            Retomar IA
          </Button>
        </div>
      )}

      {/* Row 1: Lead toggle + AI toggle */}
      {!isInHandoff && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="is-lead"
              checked={isCrmLead}
              onCheckedChange={handleToggleLead}
              disabled={loading}
            />
            <Label htmlFor="is-lead" className="text-sm cursor-pointer">
              É Lead
            </Label>
          </div>

          {isCrmLead && (
            <div className="flex items-center gap-2">
              <Switch
                id="ai-active"
                checked={isAiActive}
                onCheckedChange={handleToggleAI}
                disabled={loading}
              />
              <Label htmlFor="ai-active" className="text-sm cursor-pointer flex items-center gap-1">
                {isAiActive ? (
                  <>
                    <Bot className="h-3 w-3 text-green-500" />
                    IA Ativa
                  </>
                ) : (
                  <>
                    <BotOff className="h-3 w-3 text-orange-500" />
                    IA Pausada
                  </>
                )}
              </Label>
            </div>
          )}
        </div>
      )}

      {/* Row 2: Funnel selector (only if lead) */}
      {isCrmLead && funnels.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={currentFunnelId} onValueChange={handleFunnelChange} disabled={loading}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id} className="text-xs">
                  {funnel.name} {funnel.is_default && '(Padrão)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Row 3: Origin + Stage (only if lead and funnel selected) */}
      {isCrmLead && (
        <div className="flex items-center gap-2">
          <Select value={currentOrigin} onValueChange={handleOriginChange} disabled={loading}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {ORIGINS.map((origin) => (
                <SelectItem key={origin.id} value={origin.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <origin.icon className="h-3 w-3" />
                    {origin.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {stages.length > 0 && (
            <Select value={currentStage} onValueChange={handleStageChange} disabled={loading}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Estágio" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: stage.color }}
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

      {/* Delete Conversation */}
      <div className="pt-2 border-t border-border">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={loading}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Deletar Conversa
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as mensagens desta conversa serão permanentemente removidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConversation}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Deletar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

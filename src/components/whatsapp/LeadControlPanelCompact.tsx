import { Bot, BotOff, Loader2, UserCheck, UserX, MoreVertical, Trash2, Radio, Megaphone, Archive, ArchiveRestore, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Stage {
  id: string;
  name: string;
  color: string;
  stage_order: number;
}

interface LeadControlPanelCompactProps {
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
    status?: string;
    reminder_at?: string | null;
  };
  onUpdate?: () => void;
  onArchive?: (archive: boolean) => void;
  onDelete?: () => void;
  onReminderClick?: () => void;
}

export function LeadControlPanelCompact({ conversation, onUpdate, onDelete, onArchive, onReminderClick }: LeadControlPanelCompactProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isInHandoff = conversation.tags?.includes('21') || conversation.tags?.includes('23');
  const isAiActive = conversation.is_crm_lead && !conversation.ai_paused && !conversation.is_group && !isInHandoff;
  const currentFunnelId = conversation.crm_funnel_id || '';
  const currentStage = conversation.funnel_stage || '';
  const isCrmLead = conversation.is_crm_lead === true;
  const currentOrigin = conversation.origin || 'random';
  const isArchived = conversation.status === 'archived';
  const hasReminder = !!conversation.reminder_at;

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
      });
      onUpdate?.();
    } catch (error) {
      console.error('Error toggling AI:', error);
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
      });
      onUpdate?.();
    } catch (error) {
      console.error('Error toggling lead:', error);
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
      onUpdate?.();
    } catch (error) {
      console.error('Error updating stage:', error);
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
      onUpdate?.();
    } catch (error) {
      console.error('Error updating origin:', error);
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
      toast({ title: 'IA Retomada' });
      onUpdate?.();
    } catch (error) {
      console.error('Error resuming from handoff:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async () => {
    setLoading(true);
    try {
      await supabase.from('whatsapp_ai_logs').delete().eq('conversation_id', conversation.id);
      await supabase.from('whatsapp_messages').delete().eq('conversation_id', conversation.id);
      await supabase.from('whatsapp_conversations').delete().eq('id', conversation.id);

      toast({ title: 'Conversa deletada' });
      setDeleteDialogOpen(false);
      onDelete?.();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Erro ao deletar',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't show controls for groups
  if (conversation.is_group) {
    return null;
  }

  const currentStageData = stages.find(s => s.id === currentStage);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

        {/* Handoff Resume Button */}
        {isInHandoff && (
          <Button
            size="sm"
            variant="default"
            onClick={handleResumeFromHandoff}
            disabled={loading}
            className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700"
          >
            <Bot className="h-3 w-3" />
            Retomar
          </Button>
        )}

        {!isInHandoff && (
          <>
            {/* Reminder Button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={hasReminder ? "default" : "ghost"} 
                  size="icon" 
                  className={cn("h-7 w-7", hasReminder && "bg-amber-500 hover:bg-amber-600")}
                  onClick={onReminderClick}
                  disabled={loading}
                >
                  <Bell className={cn("h-3.5 w-3.5", hasReminder && "text-white")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>
                  {hasReminder 
                    ? `Lembrete: ${format(new Date(conversation.reminder_at!), "dd/MM 'às' HH:mm", { locale: ptBR })}` 
                    : 'Agendar Lembrete'
                  }
                </p>
              </TooltipContent>
            </Tooltip>

            {/* Toggle Lead - icon only */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant={isCrmLead ? "default" : "ghost"} 
                  size="icon" 
                  className="h-7 w-7"
                  onClick={handleToggleLead}
                  disabled={loading}
                >
                  {isCrmLead ? (
                    <UserCheck className="h-3.5 w-3.5" />
                  ) : (
                    <UserX className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isCrmLead ? 'É Lead (clique para desativar)' : 'Não é Lead (clique para ativar)'}</p>
              </TooltipContent>
            </Tooltip>

            {/* Toggle AI - icon only, only if lead */}
            {isCrmLead && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={isAiActive ? "default" : "outline"} 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={handleToggleAI}
                    disabled={loading}
                  >
                    {isAiActive ? (
                      <Bot className="h-3.5 w-3.5" />
                    ) : (
                      <BotOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{isAiActive ? 'IA Ativa (clique para pausar)' : 'IA Pausada (clique para ativar)'}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Stage selector - compact, only if lead */}
            {isCrmLead && stages.length > 0 && (
              <Select value={currentStage} onValueChange={handleStageChange} disabled={loading}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[90px] max-w-[140px]">
                  <div className="flex items-center gap-1.5 truncate">
                    {currentStageData && (
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: currentStageData.color }}
                      />
                    )}
                    <SelectValue placeholder="Estágio" />
                  </div>
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
          </>
        )}

        {/* More options dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            {/* Origin selector */}
            {isCrmLead && (
              <>
                <DropdownMenuItem 
                  onClick={() => handleOriginChange('random')}
                  className="text-xs"
                >
                  <Radio className="h-3.5 w-3.5 mr-2" />
                  Origem: Aleatório
                  {currentOrigin === 'random' && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleOriginChange('broadcast')}
                  className="text-xs"
                >
                  <Megaphone className="h-3.5 w-3.5 mr-2" />
                  Origem: Broadcast
                  {currentOrigin === 'broadcast' && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {onArchive && (
              <DropdownMenuItem 
                onClick={() => onArchive(!isArchived)}
                className="text-xs"
              >
                {isArchived ? (
                  <>
                    <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                    Desarquivar
                  </>
                ) : (
                  <>
                    <Archive className="h-3.5 w-3.5 mr-2" />
                    Arquivar
                  </>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem 
              onClick={() => setDeleteDialogOpen(true)}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Deletar conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deletar conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as mensagens serão removidas.
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
    </TooltipProvider>
  );
}

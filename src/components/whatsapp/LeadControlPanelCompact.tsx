import { Bot, BotOff, Loader2, UserCheck, UserX, MoreVertical, Trash2, Radio, Megaphone, Archive, ArchiveRestore, Bell, UserPlus, ArrowRightLeft, Mail, StickyNote, Wifi, WifiOff, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useCallback } from 'react';
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
    phone?: string;
    name?: string | null;
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
    assigned_to?: string | null;
    config_id?: string;
  };
  onUpdate?: () => void;
  onArchive?: (archive: boolean) => void;
  onDelete?: () => void;
  onReminderClick?: () => void;
  onAssignToMe?: () => void;
  onTransferUser?: () => void;
  onTransferInstance?: () => void;
  onMarkUnread?: () => void;
  onAddToCRM?: (phone: string, name?: string, configId?: string) => void;
  hasMultipleInstances?: boolean;
  instanceDisconnected?: boolean;
  initialNotes?: string | null;
  isMobile?: boolean;
}

export function LeadControlPanelCompact({ 
  conversation, 
  onUpdate, 
  onDelete, 
  onArchive, 
  onReminderClick, 
  onAssignToMe, 
  onTransferUser,
  onTransferInstance,
  onMarkUnread,
  onAddToCRM,
  hasMultipleInstances,
  instanceDisconnected,
  initialNotes,
  isMobile = false
}: LeadControlPanelCompactProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Sync initialNotes with state
  useEffect(() => {
    setNotes(initialNotes || '');
  }, [initialNotes]);

  const isInHandoff = conversation.tags?.includes('21') || conversation.tags?.includes('23');
  const isAiActive = conversation.is_crm_lead && !conversation.ai_paused && !conversation.is_group && !isInHandoff;
  const currentFunnelId = conversation.crm_funnel_id || '';
  const currentStage = conversation.funnel_stage || '';
  const isCrmLead = conversation.is_crm_lead === true;
  const currentOrigin = conversation.origin || 'random';
  const isArchived = conversation.status === 'archived';
  const hasReminder = !!conversation.reminder_at;
  const hasNotes = !!notes?.trim();

  // Auto-save notes with debounce
  const saveNotes = useCallback(async (value: string) => {
    setSaveStatus('saving');
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ notes: value || null })
      .eq('id', conversation.id);
    
    if (!error) {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } else {
      setSaveStatus('idle');
      toast({ title: 'Erro ao salvar nota', variant: 'destructive' });
    }
  }, [conversation.id, toast]);

  useEffect(() => {
    if (notes !== initialNotes) {
      const timer = setTimeout(() => {
        saveNotes(notes);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [notes, initialNotes, saveNotes]);

  // Load stages when funnel changes - fallback to default funnel if not set
  useEffect(() => {
    const loadStages = async () => {
      let funnelId = currentFunnelId;
      
      // Se não tem funil definido, busca o padrão
      if (!funnelId) {
        const { data: defaultFunnel } = await supabase
          .from('crm_funnels')
          .select('id')
          .eq('is_default', true)
          .single();
        funnelId = defaultFunnel?.id || '';
      }
      
      if (!funnelId) {
        setStages([]);
        return;
      }
      
      const { data } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, color, stage_order')
        .eq('funnel_id', funnelId)
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
      // Se não tem funil, define o padrão junto com o estágio
      let funnelId = conversation.crm_funnel_id;
      if (!funnelId) {
        const { data: defaultFunnel } = await supabase
          .from('crm_funnels')
          .select('id')
          .eq('is_default', true)
          .single();
        funnelId = defaultFunnel?.id || null;
      }
      
      // Verificar se o estágio alvo é "Perdido" para arquivar automaticamente
      const targetStage = stages.find(s => s.id === value);
      const isLostStage = targetStage?.name.toLowerCase().includes('perdido') ||
                          targetStage?.name.toLowerCase().includes('lost');
      
      const updateData: Record<string, unknown> = {
        funnel_stage: value,
        crm_funnel_id: funnelId
      };
      
      // Se for "Perdido", arquivar automaticamente
      if (isLostStage) {
        updateData.status = 'archived';
      }
      
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversation.id);

      if (error) throw error;
      
      if (isLostStage) {
        toast({
          title: 'Lead marcado como perdido',
          description: 'A conversa foi arquivada automaticamente.',
        });
      }
      
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

  // Mobile layout - ultra compact: just AI badge + single menu
  if (isMobile) {
    return (
      <div className="flex items-center gap-1">
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

        {/* AI Status Badge - visual indicator only */}
        {isCrmLead && !isInHandoff && (
          <Badge 
            variant={isAiActive ? "default" : "outline"} 
            className={cn(
              "h-5 px-1.5 text-[10px] gap-0.5",
              isAiActive && "bg-emerald-500 hover:bg-emerald-600"
            )}
          >
            {isAiActive ? <Bot className="h-3 w-3" /> : <BotOff className="h-3 w-3" />}
          </Badge>
        )}

        {/* Handoff badge */}
        {isInHandoff && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-0.5 border-amber-500 text-amber-600">
            <Bot className="h-3 w-3" />
          </Badge>
        )}

        {/* Single dropdown with ALL actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover">
            {/* Resume from handoff */}
            {isInHandoff && (
              <>
                <DropdownMenuItem onClick={handleResumeFromHandoff} className="text-xs">
                  <Bot className="h-3.5 w-3.5 mr-2" />
                  Retomar IA
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Toggle AI */}
            {isCrmLead && !isInHandoff && (
              <DropdownMenuItem onClick={handleToggleAI} className="text-xs">
                {isAiActive ? <BotOff className="h-3.5 w-3.5 mr-2" /> : <Bot className="h-3.5 w-3.5 mr-2" />}
                {isAiActive ? 'Pausar IA' : 'Ativar IA'}
              </DropdownMenuItem>
            )}

            {/* Add to CRM - for non-leads with modal */}
            {!isCrmLead && onAddToCRM && conversation.phone && (
              <DropdownMenuItem 
                onClick={() => onAddToCRM(conversation.phone!, conversation.name || undefined, conversation.config_id)} 
                className="text-xs"
              >
                <UserPlus className="h-3.5 w-3.5 mr-2" />
                Adicionar ao CRM
              </DropdownMenuItem>
            )}

            {/* Define Funnel - for leads without funnel (orphan leads) */}
            {isCrmLead && !currentFunnelId && onAddToCRM && conversation.phone && (
              <DropdownMenuItem 
                onClick={() => onAddToCRM(conversation.phone!, conversation.name || undefined, conversation.config_id)} 
                className="text-xs text-amber-600"
              >
                <UserPlus className="h-3.5 w-3.5 mr-2" />
                Definir Funil
              </DropdownMenuItem>
            )}

            {/* Toggle Lead - for existing leads (remove) or fallback when no onAddToCRM */}
            {(isCrmLead || !onAddToCRM) && (
              <DropdownMenuItem onClick={handleToggleLead} className="text-xs">
                {isCrmLead ? <UserX className="h-3.5 w-3.5 mr-2" /> : <UserCheck className="h-3.5 w-3.5 mr-2" />}
                {isCrmLead ? 'Remover do CRM' : 'Ativar Lead'}
              </DropdownMenuItem>
            )}

            {/* Stage submenu */}
            {isCrmLead && stages.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <div className="flex items-center gap-2">
                    {currentStageData && (
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: currentStageData.color }}
                      />
                    )}
                    Etapa: {currentStageData?.name || 'Selecionar'}
                  </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-popover">
                  {stages.map((stage) => (
                    <DropdownMenuItem 
                      key={stage.id} 
                      onClick={() => handleStageChange(stage.id)}
                      className="text-xs"
                    >
                      <span 
                        className="w-2 h-2 rounded-full mr-2" 
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                      {stage.id === currentStage && <span className="ml-auto">✓</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            <DropdownMenuSeparator />

            {/* Reminder */}
            {onReminderClick && (
              <DropdownMenuItem onClick={onReminderClick} className="text-xs">
                <Bell className={cn("h-3.5 w-3.5 mr-2", hasReminder && "text-amber-500")} />
                {hasReminder 
                  ? `Lembrete: ${format(new Date(conversation.reminder_at!), "dd/MM HH:mm", { locale: ptBR })}` 
                  : 'Agendar Lembrete'
                }
              </DropdownMenuItem>
            )}

            {/* Notes */}
            <DropdownMenuItem onClick={() => setNotesOpen(true)} className="text-xs">
              <StickyNote className={cn("h-3.5 w-3.5 mr-2", hasNotes && "text-amber-500")} />
              {hasNotes ? 'Editar Notas' : 'Adicionar Notas'}
            </DropdownMenuItem>

            {onMarkUnread && (
              <DropdownMenuItem onClick={onMarkUnread} className="text-xs">
                <Mail className="h-3.5 w-3.5 mr-2" />
                Marcar não lido
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            {/* Assign / Transfer */}
            {!conversation.assigned_to && onAssignToMe && (
              <DropdownMenuItem onClick={onAssignToMe} className="text-xs">
                <UserPlus className="h-3.5 w-3.5 mr-2" />
                Assumir Lead
              </DropdownMenuItem>
            )}
            {conversation.assigned_to && onTransferUser && (
              <DropdownMenuItem onClick={onTransferUser} className="text-xs">
                <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                Transferir Lead
              </DropdownMenuItem>
            )}

            {/* Transfer Instance */}
            {hasMultipleInstances && onTransferInstance && (
              <DropdownMenuItem 
                onClick={onTransferInstance}
                className={cn("text-xs", instanceDisconnected && "text-destructive")}
              >
                {instanceDisconnected ? <WifiOff className="h-3.5 w-3.5 mr-2" /> : <Wifi className="h-3.5 w-3.5 mr-2" />}
                {instanceDisconnected ? 'Transferir (Desconectada)' : 'Transferir instância'}
              </DropdownMenuItem>
            )}

            {/* Origin */}
            {isCrmLead && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleOriginChange('random')} className="text-xs">
                  <Radio className="h-3.5 w-3.5 mr-2" />
                  Origem: Aleatório
                  {currentOrigin === 'random' && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleOriginChange('broadcast')} className="text-xs">
                  <Megaphone className="h-3.5 w-3.5 mr-2" />
                  Origem: Broadcast
                  {currentOrigin === 'broadcast' && <span className="ml-auto">✓</span>}
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            {/* Archive */}
            {onArchive && (
              <DropdownMenuItem onClick={() => onArchive(!isArchived)} className="text-xs">
                {isArchived ? <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> : <Archive className="h-3.5 w-3.5 mr-2" />}
                {isArchived ? 'Desarquivar' : 'Arquivar'}
              </DropdownMenuItem>
            )}

            {/* Delete */}
            <DropdownMenuItem 
              onClick={() => setDeleteDialogOpen(true)}
              className="text-xs text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Deletar conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notes Popover for mobile */}
        <Popover open={notesOpen} onOpenChange={setNotesOpen}>
          <PopoverTrigger asChild>
            <span className="hidden" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Notas internas</span>
                {saveStatus === 'saving' && (
                  <span className="text-[10px] text-muted-foreground">Salvando...</span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[10px] text-emerald-500">Salvo!</span>
                )}
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escreva notas privadas sobre este lead..."
                className="text-xs min-h-[80px] resize-none"
              />
            </div>
          </PopoverContent>
        </Popover>

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
    );
  }

  // Desktop layout - original inline buttons
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

        {/* Notes Popover */}
        <Popover open={notesOpen} onOpenChange={setNotesOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant={hasNotes ? "default" : "ghost"} 
              size="icon" 
              className={cn("h-7 w-7", hasNotes && "bg-amber-500 hover:bg-amber-600")}
            >
              <StickyNote className={cn("h-3.5 w-3.5", hasNotes && "text-white")} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Notas internas</span>
                {saveStatus === 'saving' && (
                  <span className="text-[10px] text-muted-foreground">Salvando...</span>
                )}
                {saveStatus === 'saved' && (
                  <span className="text-[10px] text-emerald-500">Salvo!</span>
                )}
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escreva notas privadas sobre este lead..."
                className="text-xs min-h-[80px] resize-none"
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* More options dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            {/* Quick actions at top */}
            {onMarkUnread && (
              <DropdownMenuItem 
                onClick={onMarkUnread}
                className="text-xs"
              >
                <Mail className="h-3.5 w-3.5 mr-2" />
                Marcar não lido
              </DropdownMenuItem>
            )}
            
            {/* Transfer Instance */}
            {hasMultipleInstances && onTransferInstance && (
              <DropdownMenuItem 
                onClick={onTransferInstance}
                className={cn("text-xs", instanceDisconnected && "text-destructive")}
              >
                {instanceDisconnected ? (
                  <WifiOff className="h-3.5 w-3.5 mr-2" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 mr-2" />
                )}
                {instanceDisconnected ? 'Transferir (Desconectada)' : 'Transferir instância'}
              </DropdownMenuItem>
            )}
            
            {(onMarkUnread || (hasMultipleInstances && onTransferInstance)) && <DropdownMenuSeparator />}
            
            {/* Assign to me / Transfer */}
            {!conversation.assigned_to && onAssignToMe && (
              <DropdownMenuItem 
                onClick={onAssignToMe}
                className="text-xs"
              >
                <UserPlus className="h-3.5 w-3.5 mr-2" />
                Assumir Lead
              </DropdownMenuItem>
            )}
            {conversation.assigned_to && onTransferUser && (
              <DropdownMenuItem 
                onClick={onTransferUser}
                className="text-xs"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />
                Transferir Lead
              </DropdownMenuItem>
            )}
            {(onAssignToMe || onTransferUser) && <DropdownMenuSeparator />}

            {/* Define Funnel - for leads without funnel (orphan leads) */}
            {isCrmLead && !currentFunnelId && onAddToCRM && conversation.phone && (
              <DropdownMenuItem 
                onClick={() => onAddToCRM(conversation.phone!, conversation.name || undefined, conversation.config_id)} 
                className="text-xs text-amber-600"
              >
                <UserPlus className="h-3.5 w-3.5 mr-2" />
                Definir Funil
              </DropdownMenuItem>
            )}
            
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

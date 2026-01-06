import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Settings, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { LeadDetailsSheet } from '@/components/LeadDetailsSheet';
import { useReminderNotifications } from '@/hooks/useReminderNotifications';
import {
  CRMMetricsBar,
  CRMFilters,
  LeadCard,
  ReminderModal,
  TagModal,
  ValueModal,
  type PeriodFilter,
  type AIStatusFilter,
  type UrgencyFilter,
  type SortOption,
} from '@/components/crm';
import type { WhatsAppConversation } from '@/types/whatsapp';
import type { CRMFunnel, CRMFunnelStage } from '@/types/crm';

interface BANTScore {
  budget?: boolean;
  authority?: boolean;
  need?: boolean;
  timing?: boolean;
}

export default function CRMKanban() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [bantScores, setBantScores] = useState<Record<string, BANTScore>>({});
  const [loading, setLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<WhatsAppConversation | null>(null);
  const [selectedLead, setSelectedLead] = useState<WhatsAppConversation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Funnel state
  const [funnels, setFunnels] = useState<CRMFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [stages, setStages] = useState<CRMFunnelStage[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [aiStatusFilter, setAIStatusFilter] = useState<AIStatusFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [showRemindersOnly, setShowRemindersOnly] = useState(false);

  // Modal states
  const [reminderModal, setReminderModal] = useState<{ open: boolean; lead: WhatsAppConversation | null }>({ open: false, lead: null });
  const [tagModal, setTagModal] = useState<{ open: boolean; lead: WhatsAppConversation | null }>({ open: false, lead: null });
  const [valueModal, setValueModal] = useState<{ open: boolean; lead: WhatsAppConversation | null }>({ open: false, lead: null });

  // Reminder notifications
  useReminderNotifications({
    conversations,
    onReminderTriggered: (conv) => {
      setSelectedLead(conv);
      setSheetOpen(true);
    },
  });

  // Count pending reminders
  const pendingRemindersCount = useMemo(() => {
    return conversations.filter(c => c.reminder_at).length;
  }, [conversations]);

  // Selected funnel
  const selectedFunnel = useMemo(() => {
    return funnels.find(f => f.id === selectedFunnelId) || null;
  }, [funnels, selectedFunnelId]);

  useEffect(() => {
    loadFunnels();
  }, []);

  useEffect(() => {
    if (selectedFunnelId) {
      loadStages(selectedFunnelId);
      loadConversations(selectedFunnelId);
    }
  }, [selectedFunnelId]);

  useEffect(() => {
    const channel = supabase
      .channel('crm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => {
        if (selectedFunnelId) loadConversations(selectedFunnelId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFunnelId]);

  const loadFunnels = async () => {
    try {
      const { data, error } = await supabase
        .from('crm_funnels')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      setFunnels(data || []);

      // Auto-select default funnel or first one
      if (data && data.length > 0) {
        const defaultFunnel = data.find(f => f.is_default) || data[0];
        setSelectedFunnelId(defaultFunnel.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading funnels:', error);
      setLoading(false);
    }
  };

  const loadStages = async (funnelId: string) => {
    try {
      const { data, error } = await supabase
        .from('crm_funnel_stages')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: true });

      if (error) throw error;
      setStages(data || []);
    } catch (error) {
      console.error('Error loading stages:', error);
    }
  };

  const loadConversations = async (funnelId: string) => {
    try {
      const { data: leadConversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      setConversations(leadConversations || []);

      // Load BANT scores for leads
      if (leadConversations && leadConversations.length > 0) {
        const { data: aiLogs } = await supabase
          .from('whatsapp_ai_logs')
          .select('conversation_id, bant_score')
          .in('conversation_id', leadConversations.map(c => c.id))
          .not('bant_score', 'is', null);

        const scores: Record<string, BANTScore> = {};
        aiLogs?.forEach(log => {
          if (log.conversation_id && log.bant_score) {
            scores[log.conversation_id] = log.bant_score as BANTScore;
          }
        });
        setBantScores(scores);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const filteredConversations = useMemo(() => {
    let result = [...conversations];

    // Reminders filter
    if (showRemindersOnly) {
      result = result.filter(c => c.reminder_at);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name?.toLowerCase().includes(query) ||
        c.phone.includes(query)
      );
    }

    // Period filter
    const now = Date.now();
    if (periodFilter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      result = result.filter(c => new Date(c.updated_at) >= today);
    } else if (periodFilter === 'week') {
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      result = result.filter(c => new Date(c.updated_at).getTime() >= weekAgo);
    } else if (periodFilter === 'month') {
      const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
      result = result.filter(c => new Date(c.updated_at).getTime() >= monthAgo);
    }

    // AI Status filter
    if (aiStatusFilter === 'ai_active') {
      result = result.filter(c => !c.ai_paused);
    } else if (aiStatusFilter === 'manual') {
      result = result.filter(c => c.ai_paused);
    } else if (aiStatusFilter === 'handoff') {
      result = result.filter(c => c.ai_handoff_reason);
    }

    // Urgency filter
    if (urgencyFilter === 'hot') {
      result = result.filter(c => {
        if (!c.last_message_at) return false;
        const hours = (now - new Date(c.last_message_at).getTime()) / 3600000;
        return hours < 1;
      });
    } else if (urgencyFilter === 'warm') {
      result = result.filter(c => {
        if (!c.last_message_at) return false;
        const hours = (now - new Date(c.last_message_at).getTime()) / 3600000;
        return hours >= 1 && hours < 24;
      });
    } else if (urgencyFilter === 'cold') {
      result = result.filter(c => {
        if (!c.last_message_at) return true;
        const hours = (now - new Date(c.last_message_at).getTime()) / 3600000;
        return hours >= 24;
      });
    }

    // Sorting
    if (sortOption === 'oldest') {
      result.sort((a, b) => new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime());
    } else if (sortOption === 'value') {
      result.sort((a, b) => (b.estimated_value || 0) - (a.estimated_value || 0));
    } else {
      result.sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
    }

    return result;
  }, [conversations, searchQuery, periodFilter, aiStatusFilter, urgencyFilter, sortOption, showRemindersOnly]);

  const getConversationsForStage = (stage: CRMFunnelStage) => {
    return filteredConversations.filter(conv => 
      conv.funnel_stage === stage.id
    );
  };

  const getUnclassifiedConversations = () => {
    const allStageIds = stages.map(s => s.id);
    return filteredConversations.filter(conv => 
      !conv.funnel_stage || !allStageIds.includes(conv.funnel_stage)
    );
  };

  const handleDragStart = (conv: WhatsAppConversation) => {
    setDraggedItem(conv);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetStage: CRMFunnelStage) => {
    if (!draggedItem) return;

    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          funnel_stage: targetStage.id, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', draggedItem.id);

      toast({
        title: 'Lead movido',
        description: `${draggedItem.name || draggedItem.phone} movido para ${targetStage.name}`,
      });

      if (selectedFunnelId) loadConversations(selectedFunnelId);
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: 'Erro ao mover lead',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setDraggedItem(null);
    }
  };

  const handleSaveReminder = async (date: Date) => {
    if (!reminderModal.lead) return;

    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ reminder_at: date.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', reminderModal.lead.id);

      toast({
        title: 'Lembrete agendado',
        description: `Lembrete para ${date.toLocaleString('pt-BR')}`,
      });

      if (selectedFunnelId) loadConversations(selectedFunnelId);
    } catch (error) {
      console.error('Error saving reminder:', error);
      toast({ title: 'Erro ao salvar lembrete', variant: 'destructive' });
    }
  };

  const handleRemoveReminder = async (lead?: WhatsAppConversation) => {
    const targetLead = lead || reminderModal.lead;
    if (!targetLead) return;

    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ reminder_at: null, updated_at: new Date().toISOString() })
        .eq('id', targetLead.id);

      toast({ title: 'Lembrete removido' });
      if (selectedFunnelId) loadConversations(selectedFunnelId);
    } catch (error) {
      console.error('Error removing reminder:', error);
      toast({ title: 'Erro ao remover lembrete', variant: 'destructive' });
    }
  };

  const handleSaveTags = async (tags: string[]) => {
    if (!tagModal.lead) return;

    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ custom_tags: tags, updated_at: new Date().toISOString() })
        .eq('id', tagModal.lead.id);

      toast({ title: 'Tags atualizadas' });
      if (selectedFunnelId) loadConversations(selectedFunnelId);
    } catch (error) {
      console.error('Error saving tags:', error);
      toast({ title: 'Erro ao salvar tags', variant: 'destructive' });
    }
  };

  const handleSaveValue = async (value: number | null) => {
    if (!valueModal.lead) return;

    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ estimated_value: value, updated_at: new Date().toISOString() })
        .eq('id', valueModal.lead.id);

      toast({ title: value ? `Valor definido: R$ ${value.toLocaleString('pt-BR')}` : 'Valor removido' });
      if (selectedFunnelId) loadConversations(selectedFunnelId);
    } catch (error) {
      console.error('Error saving value:', error);
      toast({ title: 'Erro ao salvar valor', variant: 'destructive' });
    }
  };

  const getStageValue = (conversations: WhatsAppConversation[]) => {
    const total = conversations.reduce((sum, c) => sum + (c.estimated_value || 0), 0);
    return total > 0 ? `R$ ${total.toLocaleString('pt-BR')}` : null;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // No funnels state
  if (funnels.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Nenhum funil configurado.</p>
        <Button onClick={() => navigate('/crm/funnels')}>
          Criar Funil
        </Button>
      </div>
    );
  }

  const unclassified = getUnclassifiedConversations();

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      {/* Header with Metrics */}
      <div className="border-b p-3 space-y-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Funnel Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  {selectedFunnel?.name || 'Selecionar Funil'}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {funnels.map((funnel) => (
                  <DropdownMenuItem
                    key={funnel.id}
                    onClick={() => setSelectedFunnelId(funnel.id)}
                    className={cn(
                      'gap-2',
                      funnel.id === selectedFunnelId && 'bg-accent'
                    )}
                  >
                    {funnel.name}
                    {funnel.is_default && (
                      <Badge variant="secondary" className="ml-auto text-[10px]">
                        Padrão
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/crm/funnels')} className="gap-2">
                  <Settings className="h-4 w-4" />
                  Gerenciar Funis
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Badge variant="secondary" className="text-xs">
              {filteredConversations.length} leads
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => selectedFunnelId && loadConversations(selectedFunnelId)} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>

        {/* Metrics Bar */}
        <CRMMetricsBar conversations={conversations} />

        {/* Filters */}
        <CRMFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          periodFilter={periodFilter}
          onPeriodChange={setPeriodFilter}
          aiStatusFilter={aiStatusFilter}
          onAIStatusChange={setAIStatusFilter}
          urgencyFilter={urgencyFilter}
          onUrgencyChange={setUrgencyFilter}
          sortOption={sortOption}
          onSortChange={setSortOption}
          showRemindersOnly={showRemindersOnly}
          onRemindersFilterChange={setShowRemindersOnly}
          pendingRemindersCount={pendingRemindersCount}
        />
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-3 h-full min-w-max">
          {/* Unclassified Column */}
          {unclassified.length > 0 && (
            <div className="w-72 flex-shrink-0 flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="font-medium text-sm text-muted-foreground">Não Classificados</h3>
                <Badge variant="secondary" className="text-xs">{unclassified.length}</Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {unclassified.map((conv) => (
                    <LeadCard
                      key={conv.id}
                      conv={conv}
                      isDragging={draggedItem?.id === conv.id}
                      onDragStart={() => handleDragStart(conv)}
                      onClick={() => { setSelectedLead(conv); setSheetOpen(true); }}
                      onSetReminder={() => setReminderModal({ open: true, lead: conv })}
                      onAddTag={() => setTagModal({ open: true, lead: conv })}
                      onSetValue={() => setValueModal({ open: true, lead: conv })}
                      bantScore={bantScores[conv.id]}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Stage Columns */}
          {stages.map((stage) => {
            const stageConversations = getConversationsForStage(stage);
            const stageValue = getStageValue(stageConversations);

            return (
              <div
                key={stage.id}
                className="w-72 flex-shrink-0 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage)}
              >
                <div 
                  className="mb-2 flex items-center justify-between p-2 rounded-lg border-t-4 bg-muted/50"
                  style={{ borderTopColor: stage.color }}
                >
                  <div className="flex flex-col">
                    <h3 className="font-medium text-sm">{stage.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">
                        {stage.is_ai_controlled ? '🤖 IA' : '👤 Vendedor'}
                      </span>
                      {stageValue && (
                        <span className="text-[10px] text-green-600 font-medium">
                          {stageValue}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge className="text-xs">{stageConversations.length}</Badge>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-2 min-h-[100px]">
                    {stageConversations.map((conv) => (
                      <LeadCard
                        key={conv.id}
                        conv={conv}
                        isDragging={draggedItem?.id === conv.id}
                        onDragStart={() => handleDragStart(conv)}
                        onClick={() => { setSelectedLead(conv); setSheetOpen(true); }}
                        onSetReminder={() => setReminderModal({ open: true, lead: conv })}
                        onAddTag={() => setTagModal({ open: true, lead: conv })}
                        onSetValue={() => setValueModal({ open: true, lead: conv })}
                        bantScore={bantScores[conv.id]}
                      />
                    ))}

                    {stageConversations.length === 0 && (
                      <div className="flex items-center justify-center h-20 border-2 border-dashed rounded-lg text-muted-foreground text-[10px]">
                        Arraste leads aqui
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <ReminderModal
        open={reminderModal.open}
        onOpenChange={(open) => setReminderModal({ open, lead: open ? reminderModal.lead : null })}
        leadName={reminderModal.lead?.name || reminderModal.lead?.phone || ''}
        onSave={handleSaveReminder}
        onRemove={() => handleRemoveReminder()}
        currentReminder={reminderModal.lead?.reminder_at}
      />

      <TagModal
        open={tagModal.open}
        onOpenChange={(open) => setTagModal({ open, lead: open ? tagModal.lead : null })}
        leadName={tagModal.lead?.name || tagModal.lead?.phone || ''}
        currentTags={tagModal.lead?.custom_tags || []}
        onSave={handleSaveTags}
      />

      <ValueModal
        open={valueModal.open}
        onOpenChange={(open) => setValueModal({ open, lead: open ? valueModal.lead : null })}
        leadName={valueModal.lead?.name || valueModal.lead?.phone || ''}
        currentValue={valueModal.lead?.estimated_value}
        onSave={handleSaveValue}
      />

      {selectedLead && (
        <LeadDetailsSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          conversation={selectedLead}
          onUpdate={() => selectedFunnelId && loadConversations(selectedFunnelId)}
        />
      )}
    </div>
  );
}

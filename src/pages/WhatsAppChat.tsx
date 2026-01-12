import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Search, Bot, BotOff, Phone, MessageSquareOff, Mail, Clock, Filter, User, Users, Megaphone, Shuffle, ArrowRightLeft, WifiOff, Archive } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AIStatusIcon, 
  FunnelStageBadge, 
  WaitingTimeBadge,
  detectFunnelStage,
  TransferInstanceModal,
  type FunnelStageId
} from '@/components/whatsapp';
import { LeadControlPanelCompact } from '@/components/whatsapp/LeadControlPanelCompact';
import { MessageContent, formatMessagePreview } from '@/components/whatsapp/MessageContent';
import { MediaUploader, MediaPreview } from '@/components/whatsapp/MediaUploader';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation, WhatsAppMessage, WhatsAppLabel } from '@/types/whatsapp';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type FilterType = 'all' | 'no_reply' | 'unread' | 'ai_paused' | 'waiting' | 'ai_active' | 'handoff';
type ConversationType = 'all' | 'contacts' | 'groups';
type OriginType = 'all' | 'broadcast' | 'random';

interface WhatsAppInstance {
  id: string;
  name: string;
  color: string;
  instance_phone: string;
  is_active: boolean;
}

interface ConversationWithInstance extends WhatsAppConversation {
  config_id?: string;
  instance?: WhatsAppInstance;
}

export default function WhatsAppChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [conversations, setConversations] = useState<ConversationWithInstance[]>([]);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('all');
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithInstance | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [labels, setLabels] = useState<WhatsAppLabel[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [conversationType, setConversationType] = useState<ConversationType>('all');
  const [originType, setOriginType] = useState<OriginType>('all');
  const [funnelStageFilter, setFunnelStageFilter] = useState<FunnelStageId | 'all'>('all');
  const [viewTab, setViewTab] = useState<'active' | 'archived'>('active');
  
  // Media state
  const [pendingMedia, setPendingMedia] = useState<{
    url: string;
    type: 'image' | 'video' | 'document' | 'audio';
    file: File;
  } | null>(null);

  // Transfer modal state
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  // Helper to detect if a conversation is a group
  const isGroup = (conv: ConversationWithInstance): boolean => {
    return conv.is_group === true || conv.phone.includes('@g.us');
  };

  useEffect(() => {
    loadInstances();
    loadConversations();
    loadLabels();
    
    const conversationsChannel = supabase
      .channel('conversations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(conversationsChannel);
    };
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);

      const messagesChannel = supabase
        .channel('messages-changes')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${selectedConversation.id}`
        }, (payload) => {
          setMessages(prev => [...prev, payload.new as WhatsAppMessage]);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-select conversation from URL parameters (phone or lead id)
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    const leadParam = searchParams.get('lead');
    
    if (conversations.length > 0 && !selectedConversation) {
      let targetConv: ConversationWithInstance | undefined;
      
      if (leadParam) {
        // Find by conversation ID
        targetConv = conversations.find(c => c.id === leadParam);
      } else if (phoneParam) {
        // Find by phone number
        const normalizedParam = normalizePhone(phoneParam);
        targetConv = conversations.find(c => normalizePhone(c.phone) === normalizedParam);
      }
      
      if (targetConv) {
        setSelectedConversation(targetConv);
        // Clear the param after selecting
        setSearchParams({}, { replace: true });
      }
    }
  }, [conversations, searchParams, selectedConversation]);

  const loadInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('id, name, color, instance_phone, is_active')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInstances((data || []).map(d => ({
        id: d.id,
        name: d.name || 'Principal',
        color: d.color || '#10B981',
        instance_phone: d.instance_phone || '',
        is_active: d.is_active ?? true,
      })));
    } catch (error) {
      console.error('Error loading instances:', error);
    }
  };

  // Normaliza telefone para formato apenas dígitos (sem DDI 55)
  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 10) {
      return digits.slice(2);
    }
    return digits;
  };

  const loadConversations = async () => {
    try {
      // Buscar TODAS as conversas (sem filtro de broadcast)
      const { data: allConversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // Buscar instâncias
      const { data: instancesData } = await supabase
        .from('whatsapp_config')
        .select('id, name, color, instance_phone, is_active');

      const instanceMap = new Map<string, WhatsAppInstance>();
      instancesData?.forEach(i => instanceMap.set(i.id, {
        id: i.id,
        name: i.name || 'Principal',
        color: i.color || '#10B981',
        instance_phone: i.instance_phone || '',
        is_active: i.is_active ?? true,
      }));

      // Mapear conversas com instâncias (sem filtro)
      const mapped = (allConversations || []).map(conv => ({
        ...conv,
        instance: conv.config_id ? instanceMap.get(conv.config_id) : undefined,
      })) as ConversationWithInstance[];

      setConversations(mapped);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLabels = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_labels')
        .select('*');

      if (error) throw error;
      setLabels(data || []);
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as unknown as WhatsAppMessage[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const markAsRead = async (conversationId: string) => {
    await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  };

  const markAsUnread = async (conversationId: string) => {
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ unread_count: 1 })
      .eq('id', conversationId);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível marcar como não lido.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Marcado como não lido',
        description: 'A conversa foi marcada para revisão.',
      });
      loadConversations();
    }
  };

  const handleSend = async () => {
    if ((!newMessage.trim() && !pendingMedia) || !selectedConversation) return;

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          conversation_id: selectedConversation.id,
          message: newMessage.trim() || undefined,
          media_url: pendingMedia?.url,
          media_type: pendingMedia?.type,
          config_id: selectedConversation.config_id,
        },
      });

      // Verificar se é erro de instância desconectada
      if (data?.disconnected) {
        toast({
          title: `WhatsApp Desconectado: ${data.instance_name || 'Instância'}`,
          description: 'Acesse o painel UAZAPI e reconecte esta instância.',
          variant: 'destructive',
        });
        return;
      }

      if (error) throw error;
      setNewMessage('');
      setPendingMedia(null);
    } catch (error: unknown) {
      console.error('Error sending message:', error);
      
      // Tentar extrair mensagem de erro mais específica
      const errorMessage = error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.';
      
      toast({
        title: 'Erro ao enviar',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const handleMediaReady = (url: string, type: 'image' | 'video' | 'document' | 'audio', file: File) => {
    setPendingMedia({ url, type, file });
  };

  const handleAudioReady = (url: string, file: File) => {
    setPendingMedia({ url, type: 'audio', file });
  };

  const toggleAI = async (conversation: ConversationWithInstance) => {
    try {
      const newPausedState = !conversation.ai_paused;
      
      // Ao ativar IA: também limpar ai_handoff_reason se houver bloqueio
      // Ao pausar IA: apenas pausar, não setar ai_handoff_reason (handoff é para bloqueios reais)
      const updateData: { ai_paused: boolean; ai_handoff_reason?: null } = { 
        ai_paused: newPausedState 
      };
      
      // Se estiver ativando a IA, limpar qualquer ai_handoff_reason existente
      if (!newPausedState) {
        updateData.ai_handoff_reason = null;
      }
      
      await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversation.id);

      setSelectedConversation(prev => prev ? { 
        ...prev, 
        ai_paused: newPausedState,
        ai_handoff_reason: newPausedState ? prev.ai_handoff_reason : null
      } : null);
      loadConversations();

      toast({
        title: newPausedState ? 'IA Pausada' : 'IA Ativada',
        description: newPausedState 
          ? 'Você assumiu o controle da conversa.' 
          : 'A IA voltará a responder automaticamente.',
      });
    } catch (error) {
      console.error('Error toggling AI:', error);
    }
  };

  const getLabelName = (labelId: string) => {
    return labels.find(l => l.label_id === labelId)?.name || labelId;
  };

  const getLabelColor = (labelId: string) => {
    const colors = ['bg-gray-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-red-500'];
    const label = labels.find(l => l.label_id === labelId);
    return colors[label?.color || 0];
  };

  // Filter counts for badges
  const filterCounts = useMemo(() => {
    const baseFiltered = conversations.filter(conv => {
      const matchesSearch = conv.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.phone.includes(searchTerm);
      const matchesInstance = selectedInstance === 'all' || conv.config_id === selectedInstance;
      return matchesSearch && matchesInstance;
    });

    // Type counts (groups vs contacts)
    const contacts = baseFiltered.filter(c => !isGroup(c));
    const groups = baseFiltered.filter(c => isGroup(c));

    // Origin counts (broadcast vs random)
    const broadcast = baseFiltered.filter(c => c.is_crm_lead === true);
    const random = baseFiltered.filter(c => c.is_crm_lead !== true);

    // AI status counts (only for leads)
    const leads = broadcast;
    const aiActive = leads.filter(c => !c.ai_paused && !c.ai_handoff_reason).length;
    const aiPaused = leads.filter(c => c.ai_paused && !c.ai_handoff_reason).length;
    const handoff = leads.filter(c => !!c.ai_handoff_reason).length;

    return {
      all: baseFiltered.length,
      contacts: contacts.length,
      groups: groups.length,
      broadcast: broadcast.length,
      random: random.length,
      no_reply: baseFiltered.filter(c => !c.last_lead_message_at).length,
      unread: baseFiltered.filter(c => (c.unread_count ?? 0) > 0).length,
      ai_paused: aiPaused,
      ai_active: aiActive,
      handoff: handoff,
      waiting: baseFiltered.filter(c => {
        // Last message was outgoing and no reply for 1+ hour
        if (!c.last_message_at) return false;
        const lastMsg = new Date(c.last_message_at).getTime();
        const lastLead = c.last_lead_message_at ? new Date(c.last_lead_message_at).getTime() : 0;
        return lastMsg > lastLead && (Date.now() - lastMsg) > 3600000;
      }).length,
    };
  }, [conversations, searchTerm, selectedInstance]);

  // Funnel stage counts - use funnel_stage directly from database
  const funnelStageCounts = useMemo(() => {
    const leads = conversations.filter(c => c.is_crm_lead === true);
    const counts: Record<FunnelStageId | 'all', number> = {
      all: leads.length,
      new: 0,
      qualification: 0,
      presentation: 0,
      interest: 0,
      handoff: 0,
      negotiating: 0,
      converted: 0,
      lost: 0,
    };
    
    leads.forEach(conv => {
      const stage = (conv.funnel_stage || 'new') as FunnelStageId;
      if (counts[stage] !== undefined) {
        counts[stage]++;
      } else {
        counts.new++;
      }
    });
    
    return counts;
  }, [conversations]);

  // Chat metrics for the metrics bar
  const chatMetrics = useMemo(() => ({
    total: filterCounts.broadcast,
    aiActive: filterCounts.ai_active,
    aiPaused: filterCounts.ai_paused,
    waiting: filterCounts.waiting,
    handoff: filterCounts.handoff,
  }), [filterCounts]);

  // Handle metrics filter click
  const handleMetricsFilterClick = (filter: string) => {
    if (filter === 'all') {
      setActiveFilter('all');
    } else if (filter === 'ai_active') {
      setActiveFilter('ai_active');
    } else if (filter === 'ai_paused') {
      setActiveFilter('ai_paused');
    } else if (filter === 'waiting') {
      setActiveFilter('waiting');
    } else if (filter === 'handoff') {
      setActiveFilter('handoff');
    }
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // First, filter by active/archived tab
      const matchesTab = viewTab === 'active' 
        ? conv.status !== 'archived' 
        : conv.status === 'archived';
      
      if (!matchesTab) return false;

      const matchesSearch = conv.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conv.phone.includes(searchTerm);
      
      const matchesInstance = selectedInstance === 'all' || conv.config_id === selectedInstance;
      
      // Type filter (groups vs contacts)
      const matchesType = conversationType === 'all' || 
        (conversationType === 'contacts' && !isGroup(conv)) ||
        (conversationType === 'groups' && isGroup(conv));
      
      // Origin filter (broadcast vs random)
      const matchesOrigin = originType === 'all' ||
        (originType === 'broadcast' && conv.is_crm_lead === true) ||
        (originType === 'random' && conv.is_crm_lead !== true);

      // Funnel stage filter - use funnel_stage directly from database
      const convStage = conv.funnel_stage || 'new';
      const matchesFunnelStage = funnelStageFilter === 'all' || convStage === funnelStageFilter;
      
      if (!matchesSearch || !matchesInstance || !matchesType || !matchesOrigin || !matchesFunnelStage) return false;

      switch (activeFilter) {
        case 'no_reply':
          return !conv.last_lead_message_at;
        case 'unread':
          return (conv.unread_count ?? 0) > 0;
        case 'ai_paused':
          return conv.ai_paused && !conv.ai_handoff_reason;
        case 'ai_active':
          return conv.is_crm_lead && !conv.ai_paused && !conv.ai_handoff_reason;
        case 'handoff':
          return !!conv.ai_handoff_reason;
        case 'waiting':
          if (!conv.last_message_at) return false;
          const lastMsg = new Date(conv.last_message_at).getTime();
          const lastLead = conv.last_lead_message_at ? new Date(conv.last_lead_message_at).getTime() : 0;
          return lastMsg > lastLead && (Date.now() - lastMsg) > 3600000;
        default:
          return true;
      }
    });
  }, [conversations, searchTerm, selectedInstance, activeFilter, conversationType, originType, funnelStageFilter, viewTab]);

  // Archive counts
  const activeCount = useMemo(() => conversations.filter(c => c.status !== 'archived').length, [conversations]);
  const archivedCount = useMemo(() => conversations.filter(c => c.status === 'archived').length, [conversations]);

  // Archive conversation function
  const archiveConversation = async (conversationId: string, archive: boolean) => {
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ status: archive ? 'archived' : 'active' })
      .eq('id', conversationId);

    if (!error) {
      toast({
        title: archive ? 'Conversa arquivada' : 'Conversa desarquivada',
        description: archive 
          ? 'A conversa foi movida para arquivados.' 
          : 'A conversa foi restaurada.',
      });
      loadConversations();
      if (archive) {
        setSelectedConversation(null);
      }
    } else {
      toast({
        title: 'Erro',
        description: 'Não foi possível arquivar a conversa.',
        variant: 'destructive',
      });
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR');
  };

  // Detecta se o preview é um template de broadcast não processado
  const isBroadcastTemplate = (preview: string | null) => {
    if (!preview) return false;
    return preview.includes('{') && preview.includes('}');
  };

  // Formata o preview da mensagem
  const formatPreview = (preview: string | null) => {
    if (!preview) return 'Sem mensagens';
    if (isBroadcastTemplate(preview)) return '📢 Broadcast enviado';
    return preview;
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background overflow-hidden -m-4 md:-m-6">
      {/* Header - apenas em mobile quando conversa selecionada */}
      <div className="border-b p-3 flex items-center gap-3 md:hidden">
        {selectedConversation ? (
          <Button variant="ghost" size="icon" onClick={() => setSelectedConversation(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : null}
        <h1 className="text-lg font-semibold">
          {selectedConversation ? (selectedConversation.name || selectedConversation.phone) : 'Chat WhatsApp'}
        </h1>
        {!selectedConversation && instances.length > 1 && (
          <Select value={selectedInstance} onValueChange={setSelectedInstance}>
            <SelectTrigger className="w-[140px] ml-auto">
              <SelectValue placeholder="Instância" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {instances.map(instance => (
                <SelectItem key={instance.id} value={instance.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-2 h-2 rounded-full" 
                      style={{ backgroundColor: instance.color }}
                    />
                    {instance.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Mobile Layout */}
      <div className="flex flex-1 overflow-hidden md:hidden">
        {/* Conversations List - mobile */}
        <div className={cn(
          "border-r flex flex-col bg-background min-w-0 overflow-hidden w-full",
          selectedConversation ? "hidden" : "flex"
        )}>
          {/* Tabs for Active/Archived - Mobile */}
          <div className="px-3 pt-3">
            <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'active' | 'archived')}>
              <TabsList className="w-full h-8">
                <TabsTrigger value="active" className="flex-1 text-xs h-7">
                  Conversas ({activeCount})
                </TabsTrigger>
                <TabsTrigger value="archived" className="flex-1 text-xs h-7">
                  <Archive className="h-3 w-3 mr-1" />
                  Arquivadas ({archivedCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Compact Filter Dropdowns - Mobile */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Type Filter */}
              <Select value={conversationType} onValueChange={(value) => setConversationType(value as ConversationType)}>
                <SelectTrigger className="h-8 flex-1 min-w-[80px] text-xs">
                  <div className="flex items-center gap-1">
                    {conversationType === 'all' && <span>Tipo</span>}
                    {conversationType === 'contacts' && <><User className="h-3 w-3" /><span>Contatos</span></>}
                    {conversationType === 'groups' && <><Users className="h-3 w-3" /><span>Grupos</span></>}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos ({filterCounts.all})</SelectItem>
                  <SelectItem value="contacts"><div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Contatos ({filterCounts.contacts})</div></SelectItem>
                  <SelectItem value="groups"><div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Grupos ({filterCounts.groups})</div></SelectItem>
                </SelectContent>
              </Select>

              {/* Origin Filter */}
              <Select value={originType} onValueChange={(value) => setOriginType(value as OriginType)}>
                <SelectTrigger className="h-8 flex-1 min-w-[90px] text-xs">
                  <div className="flex items-center gap-1">
                    {originType === 'all' && <span>Origem</span>}
                    {originType === 'broadcast' && <><Megaphone className="h-3 w-3" /><span>Broadcast</span></>}
                    {originType === 'random' && <><Shuffle className="h-3 w-3" /><span>Aleatório</span></>}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="broadcast"><div className="flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" />Broadcast ({filterCounts.broadcast})</div></SelectItem>
                  <SelectItem value="random"><div className="flex items-center gap-1.5"><Shuffle className="h-3.5 w-3.5" />Aleatório ({filterCounts.random})</div></SelectItem>
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as FilterType)}>
                <SelectTrigger className="h-8 flex-1 min-w-[80px] text-xs">
                  <div className="flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    {activeFilter === 'all' && <span>Status</span>}
                    {activeFilter !== 'all' && <span>{activeFilter === 'no_reply' ? 'S/ Resp' : activeFilter === 'unread' ? 'N/ Lidas' : activeFilter === 'ai_paused' ? 'IA Pausada' : activeFilter === 'ai_active' ? 'IA Ativa' : activeFilter === 'handoff' ? 'Bloqueada' : 'Aguard.'}</span>}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos ({filterCounts.all})</SelectItem>
                  <SelectItem value="ai_active"><div className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-emerald-500" />IA Ativa ({filterCounts.ai_active})</div></SelectItem>
                  <SelectItem value="ai_paused"><div className="flex items-center gap-1.5"><BotOff className="h-3.5 w-3.5 text-amber-500" />IA Pausada ({filterCounts.ai_paused})</div></SelectItem>
                  <SelectItem value="handoff"><div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-red-500" />IA Bloqueada ({filterCounts.handoff})</div></SelectItem>
                  <SelectItem value="unread"><div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />Não Lidas ({filterCounts.unread})</div></SelectItem>
                  <SelectItem value="no_reply"><div className="flex items-center gap-1.5"><MessageSquareOff className="h-3.5 w-3.5" />Sem Resposta ({filterCounts.no_reply})</div></SelectItem>
                  <SelectItem value="waiting"><div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Aguardando ({filterCounts.waiting})</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={cn(
                  'px-3 py-3 min-h-[56px] border-b cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedConversation?.id === conv.id && 'bg-muted'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-10 w-10">
                      {conv.avatar_url && <AvatarImage src={conv.avatar_url} alt={conv.name || ''} />}
                      <AvatarFallback className="text-sm">
                        {isGroup(conv) ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          conv.name?.charAt(0).toUpperCase() || conv.phone.slice(-2)
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {conv.instance && (
                      <div 
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                        style={{ backgroundColor: conv.instance.color }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isGroup(conv) && <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        <span className="font-medium truncate text-sm max-w-[140px]">
                          {conv.name || conv.group_name || conv.phone}
                        </span>
                        {conv.is_crm_lead && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px] bg-green-500/10 text-green-600 border-green-500/30 flex-shrink-0">
                            Lead
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground truncate flex-1">
                        {formatPreview(conv.last_message_preview)}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {conv.ai_paused && (
                          <BotOff className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        {(conv.unread_count ?? 0) > 0 && (
                          <Badge className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5">
                            {conv.unread_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {filteredConversations.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                Nenhuma conversa encontrada
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat Area - mobile */}
        <div className={cn(
          "flex-1 flex flex-col bg-background w-full",
          selectedConversation ? "flex" : "hidden"
        )}>
          {selectedConversation ? (
            <>
              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map((msg, idx) => {
                    const showDate = idx === 0 || 
                      formatDate(messages[idx - 1].created_at) !== formatDate(msg.created_at);
                    
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-4">
                            <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                              {formatDate(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={cn(
                          'flex',
                          msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                        )}>
                          <div className={cn(
                            'max-w-[85%] rounded-lg px-3 py-2',
                            msg.direction === 'outgoing' 
                              ? 'bg-primary text-primary-foreground' 
                              : 'bg-muted'
                          )}>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <span className={cn(
                              'text-[10px] mt-1 block text-right',
                              msg.direction === 'outgoing' 
                                ? 'text-primary-foreground/70' 
                                : 'text-muted-foreground'
                            )}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="border-t p-3">
                {/* Media Preview */}
                {pendingMedia && (
                  <MediaPreview
                    file={pendingMedia.file}
                    url={pendingMedia.url}
                    type={pendingMedia.type}
                    onRemove={() => setPendingMedia(null)}
                  />
                )}
                
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                  className="flex items-center gap-1"
                >
                  {/* Media Buttons */}
                  <MediaUploader 
                    onMediaReady={handleMediaReady}
                    disabled={sending || !!pendingMedia}
                  />
                  <AudioRecorder 
                    onAudioReady={handleAudioReady}
                    disabled={sending || !!pendingMedia}
                  />
                  
                  <div className="relative flex-1">
                    <Input
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={sending}
                      className="flex-1 pr-8"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    size="icon" 
                    disabled={sending || (!newMessage.trim() && !pendingMedia)}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Selecione uma conversa para começar
            </div>
          )}
        </div>
      </div>

      {/* Desktop Layout with Fixed Panels */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Conversations Panel - Fixed width 350px */}
        <div className="w-[350px] flex-shrink-0 h-full flex flex-col bg-background min-w-0 overflow-hidden border-r">
              {/* Desktop Filter */}
              <div className="flex items-center gap-2 p-3 border-b">
                <h2 className="font-semibold">Conversas</h2>
                {instances.length > 1 && (
                  <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                    <SelectTrigger className="w-[140px] ml-auto">
                      <SelectValue placeholder="Instância" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {instances.map(instance => (
                        <SelectItem key={instance.id} value={instance.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: instance.color }}
                            />
                            {instance.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Tabs for Active/Archived */}
              <div className="px-3 pt-3">
                <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'active' | 'archived')}>
                  <TabsList className="w-full h-8">
                    <TabsTrigger value="active" className="flex-1 text-xs h-7">
                      Conversas ({activeCount})
                    </TabsTrigger>
                    <TabsTrigger value="archived" className="flex-1 text-xs h-7">
                      <Archive className="h-3 w-3 mr-1" />
                      Arquivadas ({archivedCount})
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="p-3 border-b space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar conversas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {/* Compact Filter Row with Dropdowns */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Type Filter (Contacts/Groups) */}
                  <Select value={conversationType} onValueChange={(value) => setConversationType(value as ConversationType)}>
                    <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
                      <div className="flex items-center gap-1.5">
                        {conversationType === 'all' && <><span>Tipo</span><Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.all}</Badge></>}
                        {conversationType === 'contacts' && <><User className="h-3 w-3" /><span>Contatos</span><Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.contacts}</Badge></>}
                        {conversationType === 'groups' && <><Users className="h-3 w-3" /><span>Grupos</span><Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.groups}</Badge></>}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center justify-between gap-3">
                          <span>Todos</span>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.all}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="contacts">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /><span>Contatos</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.contacts}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="groups">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /><span>Grupos</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.groups}</Badge>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Origin Filter (Broadcast/Random) */}
                  <Select value={originType} onValueChange={(value) => setOriginType(value as OriginType)}>
                    <SelectTrigger className="h-8 w-auto min-w-[110px] text-xs">
                      <div className="flex items-center gap-1.5">
                        {originType === 'all' && <span>Origem</span>}
                        {originType === 'broadcast' && <><Megaphone className="h-3 w-3" /><span>Broadcast</span><Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.broadcast}</Badge></>}
                        {originType === 'random' && <><Shuffle className="h-3 w-3" /><span>Aleatório</span><Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.random}</Badge></>}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="broadcast">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" /><span>Broadcast</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.broadcast}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="random">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Shuffle className="h-3.5 w-3.5" /><span>Aleatório</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.random}</Badge>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Status Filter */}
                  <Select value={activeFilter} onValueChange={(value) => setActiveFilter(value as FilterType)}>
                    <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
                      <div className="flex items-center gap-1.5">
                        <Filter className="h-3 w-3" />
                        {activeFilter === 'all' && <span>Status</span>}
                        {activeFilter === 'no_reply' && <><MessageSquareOff className="h-3 w-3" /><span>S/ Resposta</span></>}
                        {activeFilter === 'unread' && <><Mail className="h-3 w-3" /><span>Não Lidas</span></>}
                        {activeFilter === 'ai_paused' && <><BotOff className="h-3 w-3" /><span>IA Pausada</span></>}
                        {activeFilter === 'ai_active' && <><Bot className="h-3 w-3" /><span>IA Ativa</span></>}
                        {activeFilter === 'handoff' && <><Phone className="h-3 w-3" /><span>IA Bloqueada</span></>}
                        {activeFilter === 'waiting' && <><Clock className="h-3 w-3" /><span>Aguardando</span></>}
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center justify-between gap-3">
                          <span>Todos</span>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.all}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="ai_active">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Bot className="h-3.5 w-3.5 text-emerald-500" /><span>IA Ativa</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.ai_active}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="ai_paused">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><BotOff className="h-3.5 w-3.5 text-amber-500" /><span>IA Pausada</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.ai_paused}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="handoff">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-red-500" /><span>IA Bloqueada</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.handoff}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="unread">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /><span>Não Lidas</span></div>
                          <Badge variant={filterCounts.unread > 0 ? "destructive" : "secondary"} className="h-4 px-1 text-[10px]">{filterCounts.unread}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="no_reply">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><MessageSquareOff className="h-3.5 w-3.5" /><span>Sem Resposta</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.no_reply}</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="waiting">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /><span>Aguardando</span></div>
                          <Badge variant="secondary" className="h-4 px-1 text-[10px]">{filterCounts.waiting}</Badge>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Funnel Stage Filter - only when broadcast */}
                  {originType === 'broadcast' && (
                    <Select value={funnelStageFilter} onValueChange={(value) => setFunnelStageFilter(value as FunnelStageId | 'all')}>
                      <SelectTrigger className="h-8 w-auto min-w-[100px] text-xs">
                        <div className="flex items-center gap-1.5">
                          {funnelStageFilter === 'all' && <span>Funil</span>}
                          {funnelStageFilter === 'new' && <span>🆕 Novo</span>}
                          {funnelStageFilter === 'presentation' && <span>📞 Apresentação</span>}
                          {funnelStageFilter === 'interest' && <span>⭐ Interesse</span>}
                          {funnelStageFilter === 'negotiating' && <span>💬 Negociando</span>}
                          {funnelStageFilter === 'handoff' && <span>🤝 Handoff</span>}
                          {funnelStageFilter === 'converted' && <span>✅ Convertido</span>}
                          {funnelStageFilter === 'lost' && <span>❌ Perdido</span>}
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          <div className="flex items-center justify-between gap-3">
                            <span>Todos</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.all}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="new">
                          <div className="flex items-center justify-between gap-3">
                            <span>🆕 Novo</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.new}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="presentation">
                          <div className="flex items-center justify-between gap-3">
                            <span>📞 Apresentação</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.presentation}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="interest">
                          <div className="flex items-center justify-between gap-3">
                            <span>⭐ Interesse</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.interest}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="negotiating">
                          <div className="flex items-center justify-between gap-3">
                            <span>💬 Negociando</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.negotiating}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="handoff">
                          <div className="flex items-center justify-between gap-3">
                            <span>🤝 Handoff</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.handoff}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="converted">
                          <div className="flex items-center justify-between gap-3">
                            <span>✅ Convertido</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.converted}</Badge>
                          </div>
                        </SelectItem>
                        <SelectItem value="lost">
                          <div className="flex items-center justify-between gap-3">
                            <span>❌ Perdido</span>
                            <Badge variant="secondary" className="h-4 px-1 text-[10px]">{funnelStageCounts.lost}</Badge>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1">
                {filteredConversations.map((conv) => {
                  const funnelStage = detectFunnelStage(conv);
                  
                  return (
                    <div
                      key={conv.id}
                      onClick={() => setSelectedConversation(conv)}
                      className={cn(
                        'px-3 py-3 min-h-[56px] border-b cursor-pointer transition-colors',
                        selectedConversation?.id === conv.id && 'bg-muted',
                        // Background colors based on status
                        conv.ai_handoff_reason 
                          ? 'bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/20 dark:hover:bg-red-950/30'
                          : conv.ai_paused 
                            ? 'bg-amber-50/50 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
                            : conv.is_crm_lead && !conv.ai_paused 
                              ? 'bg-emerald-50/30 hover:bg-emerald-100/30 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20'
                              : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-10 w-10">
                            {conv.avatar_url && <AvatarImage src={conv.avatar_url} alt={conv.name || ''} />}
                            <AvatarFallback className="text-sm">
                              {isGroup(conv) ? (
                                <Users className="h-5 w-5" />
                              ) : (
                                conv.name?.charAt(0).toUpperCase() || conv.phone.slice(-2)
                              )}
                            </AvatarFallback>
                          </Avatar>
                          {conv.instance && (
                            <div 
                              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                              style={{ backgroundColor: conv.instance.color }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* AI Status Icon */}
                              {conv.is_crm_lead && (
                                <AIStatusIcon conversation={conv} />
                              )}
                              {isGroup(conv) && <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                              <span className="font-medium truncate text-sm max-w-[80px]">
                                {conv.name || conv.group_name || conv.phone}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Funnel Stage Badge */}
                              {conv.is_crm_lead && (
                                <FunnelStageBadge stage={funnelStage} compact />
                              )}
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatTime(conv.last_message_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                              {formatPreview(conv.last_message_preview)}
                            </p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {/* Waiting Time Badge */}
                              <WaitingTimeBadge lastMessageAt={conv.last_lead_message_at || conv.last_message_at} />
                              {(conv.unread_count ?? 0) > 0 && (
                                <Badge className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5">
                                  {conv.unread_count}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {filteredConversations.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    Nenhuma conversa encontrada
                  </div>
                )}
              </ScrollArea>
          </div>

          {/* Chat Panel - Flex grow to fill remaining space */}
          <div className="flex-1 h-full flex flex-col bg-background">
            {selectedConversation ? (
                <>
                  {/* Chat Header - Compact */}
                  <div className="border-b px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      {/* Left: Avatar + Name/Phone + Instance */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {selectedConversation.name?.charAt(0).toUpperCase() || selectedConversation.phone.slice(-2)}
                            </AvatarFallback>
                          </Avatar>
                          {selectedConversation.instance && (
                            <div 
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background"
                              style={{ backgroundColor: selectedConversation.instance.color }}
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h2 className="font-medium text-sm truncate">
                              {selectedConversation.name || selectedConversation.phone}
                            </h2>
                            {selectedConversation.instance && (
                              <span 
                                className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                                style={{ 
                                  backgroundColor: `${selectedConversation.instance.color}20`,
                                  color: selectedConversation.instance.color 
                                }}
                              >
                                {selectedConversation.instance.name}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {selectedConversation.phone}
                          </span>
                        </div>
                      </div>

                      {/* Right: Compact Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Mark as Unread - icon only */}
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => markAsUnread(selectedConversation.id)}
                          title="Marcar não lido"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                        
                        {/* Transfer Instance - icon only */}
                        {instances.length > 1 && (
                          <Button 
                            variant={selectedConversation.instance && !selectedConversation.instance.is_active ? "destructive" : "ghost"} 
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setTransferModalOpen(true)}
                            title={selectedConversation.instance && !selectedConversation.instance.is_active 
                              ? 'Transferir (Instância Desconectada)' 
                              : 'Transferir instância'}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Separator */}
                        <div className="w-px h-5 bg-border mx-1" />

                        {/* Lead Control Panel Compact */}
                        <LeadControlPanelCompact 
                          conversation={{
                            id: selectedConversation.id,
                            ai_paused: selectedConversation.ai_paused,
                            ai_handoff_reason: selectedConversation.ai_handoff_reason,
                            is_group: selectedConversation.is_group,
                            is_crm_lead: selectedConversation.is_crm_lead,
                            origin: (selectedConversation as any).origin,
                            funnel_stage: (selectedConversation as any).funnel_stage,
                            crm_funnel_id: (selectedConversation as any).crm_funnel_id,
                            tags: selectedConversation.tags,
                            status: selectedConversation.status,
                          }}
                          onUpdate={() => {
                            loadConversations();
                            if (selectedConversation) {
                              supabase
                                .from('whatsapp_conversations')
                                .select('*')
                                .eq('id', selectedConversation.id)
                                .single()
                                .then(({ data }) => {
                                  if (data) {
                                    setSelectedConversation(prev => ({
                                      ...prev!,
                                      ...data,
                                      instance: prev?.instance
                                    }));
                                  }
                                });
                            }
                          }}
                          onDelete={() => {
                            setSelectedConversation(null);
                            loadConversations();
                          }}
                          onArchive={(archive) => archiveConversation(selectedConversation.id, archive)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {messages.map((msg, idx) => {
                        const showDate = idx === 0 || 
                          formatDate(messages[idx - 1].created_at) !== formatDate(msg.created_at);
                        
                        return (
                          <div key={msg.id}>
                            {showDate && (
                              <div className="flex justify-center my-4">
                                <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                                  {formatDate(msg.created_at)}
                                </span>
                              </div>
                            )}
                            <div className={cn(
                              'flex',
                              msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                            )}>
                              <div className={cn(
                                'max-w-[70%] rounded-lg px-3 py-2 overflow-hidden',
                                msg.direction === 'outgoing' 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted'
                              )}>
                                <MessageContent
                                  content={msg.content}
                                  messageType={msg.message_type}
                                  mediaUrl={msg.media_url}
                                  direction={msg.direction as 'incoming' | 'outgoing'}
                                />
                                <span className={cn(
                                  'text-[10px] mt-1 block text-right',
                                  msg.direction === 'outgoing' 
                                    ? 'text-primary-foreground/70' 
                                    : 'text-muted-foreground'
                                )}>
                                  {formatTime(msg.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  {/* Input */}
                  <div className="border-t p-3">
                    {/* Media Preview */}
                    {pendingMedia && (
                      <MediaPreview
                        file={pendingMedia.file}
                        url={pendingMedia.url}
                        type={pendingMedia.type}
                        onRemove={() => setPendingMedia(null)}
                      />
                    )}
                    
                    <form 
                      onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                      className="flex items-center gap-1"
                    >
                      {/* Media Buttons */}
                      <MediaUploader 
                        onMediaReady={handleMediaReady}
                        disabled={sending || !!pendingMedia}
                      />
                      <AudioRecorder 
                        onAudioReady={handleAudioReady}
                        disabled={sending || !!pendingMedia}
                      />
                      
                      <div className="relative flex-1">
                        <Input
                          placeholder="Digite sua mensagem..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          disabled={sending}
                          className="flex-1 pr-8"
                        />
                      </div>
                      <Button 
                        type="submit" 
                        size="icon" 
                        disabled={sending || (!newMessage.trim() && !pendingMedia)}
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  Selecione uma conversa para começar
                </div>
              )}
          </div>
      </div>

      {/* Transfer Instance Modal */}
      {selectedConversation && (
        <TransferInstanceModal
          open={transferModalOpen}
          onOpenChange={setTransferModalOpen}
          conversationId={selectedConversation.id}
          currentConfigId={selectedConversation.config_id || null}
          contactName={selectedConversation.name || ''}
          contactPhone={selectedConversation.phone}
          onTransferComplete={() => {
            loadConversations();
            // Refresh selected conversation with new instance
            supabase
              .from('whatsapp_conversations')
              .select('*')
              .eq('id', selectedConversation.id)
              .single()
              .then(({ data }) => {
                if (data) {
                  const instance = instances.find(i => i.id === data.config_id);
                  setSelectedConversation({
                    ...data,
                    instance
                  } as ConversationWithInstance);
                }
              });
          }}
        />
      )}
    </div>
  );
}

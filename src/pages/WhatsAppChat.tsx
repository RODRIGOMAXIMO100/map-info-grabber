import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Search, Bot, BotOff, Phone, MessageSquareOff, Mail, Clock, Filter, User, Users, Megaphone, Shuffle, ArrowRightLeft, WifiOff, Archive, AlertTriangle, Check, CheckCheck, AlertCircle, UserCheck, UserPlus, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AIStatusIcon, 
  FunnelStageBadge, 
  WaitingTimeBadge,
  detectFunnelStage,
  VirtualizedConversationList,
  VirtualizedMessageList,
  type FunnelStageId
} from '@/components/whatsapp';
import { 
  TransferInstanceModal, 
  TransferUserModal, 
  ReminderModal 
} from '@/components/lazy';
import { QuickAddLeadModal } from '@/components/crm';
import { LeadControlPanelCompact } from '@/components/whatsapp/LeadControlPanelCompact';
import { MessageContent, formatMessagePreview } from '@/components/whatsapp/MessageContent';
import { MediaUploader, MediaPreview } from '@/components/whatsapp/MediaUploader';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/contexts/AuthContext';
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
  const { user, isAdmin } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [conversationListHeight, setConversationListHeight] = useState(400);
  const [messageListHeight, setMessageListHeight] = useState(400);
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

  // Transfer modal states
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferUserModalOpen, setTransferUserModalOpen] = useState(false);
  
  // Reminder modal state
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  // Quick add lead modal state
  const [quickAddLeadOpen, setQuickAddLeadOpen] = useState(false);
  const [quickAddLeadPhone, setQuickAddLeadPhone] = useState('');
  const [quickAddLeadName, setQuickAddLeadName] = useState<string | undefined>();
  
  // Emoji picker state
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  
  // Cache for assigned user names
  const [assignedUserNames, setAssignedUserNames] = useState<Record<string, string>>({});

  // Helper to detect if a conversation is a group
  const isGroup = (conv: ConversationWithInstance): boolean => {
    return conv.is_group === true || conv.phone.includes('@g.us');
  };

  useEffect(() => {
    loadInstances();
    loadConversations();
    loadLabels();
    
  }, []);

  // Use useLayoutEffect for accurate height measurement before paint
  useLayoutEffect(() => {
    const updateHeights = () => {
      if (conversationListRef.current) {
        const rect = conversationListRef.current.getBoundingClientRect();
        setConversationListHeight(rect.height);
      }
      if (messageListRef.current) {
        const rect = messageListRef.current.getBoundingClientRect();
        setMessageListHeight(rect.height);
      }
    };

    // Initial measurement
    updateHeights();

    // Set up resize observer for virtualized lists
    const resizeObserver = new ResizeObserver(() => {
      updateHeights();
    });
    
    if (conversationListRef.current) {
      resizeObserver.observe(conversationListRef.current);
    }
    if (messageListRef.current) {
      resizeObserver.observe(messageListRef.current);
    }
    
    // Also listen to window resize
    window.addEventListener('resize', updateHeights);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeights);
    };
  }, [selectedConversation?.id]);

  // Recalculate message list height when messages change
  useLayoutEffect(() => {
    if (messageListRef.current) {
      const rect = messageListRef.current.getBoundingClientRect();
      if (rect.height > 0) {
        setMessageListHeight(rect.height);
      }
    }
  }, [messages.length]);

  // Centralized realtime subscription for conversations
  useRealtimeSubscription(
    'whatsapp_conversations',
    useCallback(() => {
      loadConversations();
    }, []),
  );

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
          const newMsg = payload.new as WhatsAppMessage;
          
          setMessages(prev => {
            // Check if there's a pending optimistic message with similar content
            const hasPendingDuplicate = prev.some(m => 
              m.id.startsWith('temp-') && 
              m.direction === 'outgoing' &&
              m.content === newMsg.content &&
              m.conversation_id === newMsg.conversation_id
            );
            
            if (hasPendingDuplicate) {
              // Replace the optimistic message with the real one from database
              return prev.map(m => 
                m.id.startsWith('temp-') && 
                m.direction === 'outgoing' &&
                m.content === newMsg.content &&
                m.conversation_id === newMsg.conversation_id
                  ? newMsg
                  : m
              );
            }
            
            // If no pending duplicate, it's a new message (e.g., received)
            // But check if it already exists with the same real ID
            if (prev.some(m => m.id === newMsg.id)) {
              return prev; // Already exists, don't add
            }
            
            return [...prev, newMsg];
          });
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
      // Build query based on user role - optimized with specific columns
      let query = supabase
        .from('whatsapp_conversations')
        .select(`
          id, phone, name, avatar_url, status, notes,
          last_message_at, last_message_preview, unread_count,
          ai_paused, ai_handoff_reason, funnel_stage, crm_funnel_id,
          is_crm_lead, is_group, group_name, config_id, assigned_to,
          reminder_at, estimated_value, closed_value, custom_tags, tags,
          origin, pinned, muted_until, broadcast_list_id
        `)
        .order('last_message_at', { ascending: false })
        .limit(200);

      // If not admin, filter by assigned_to OR unassigned conversations
      if (!isAdmin && user?.id) {
        query = query.or(`assigned_to.eq.${user.id},assigned_to.is.null`);
      }

      const { data: allConversations, error } = await query;

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
      
      // Load assigned user names for conversations with assigned_to
      const assignedUserIds = [...new Set(
        mapped
          .filter(c => c.assigned_to)
          .map(c => c.assigned_to as string)
      )];
      
      if (assignedUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', assignedUserIds);
        
        if (profiles) {
          const names: Record<string, string> = {};
          profiles.forEach(p => {
            names[p.user_id] = p.full_name;
          });
          setAssignedUserNames(prev => ({ ...prev, ...names }));
        }
      }
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
        .select(`
          id, conversation_id, direction, message_type, content,
          media_url, status, created_at, edited_at, message_id_whatsapp, sent_by_user_id
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500);

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

    // Capturar valores antes de limpar
    const messageToSend = newMessage.trim();
    const mediaToSend = pendingMedia;
    const tempId = `temp-${Date.now()}`;
    
    // Criar mensagem otimista imediatamente
    const optimisticMessage: WhatsAppMessage = {
      id: tempId,
      conversation_id: selectedConversation.id,
      direction: 'outgoing',
      message_type: mediaToSend?.type || 'text',
      content: messageToSend || null,
      media_url: mediaToSend?.url || null,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    
    // Adicionar mensagem à lista IMEDIATAMENTE
    setMessages(prev => [...prev, optimisticMessage]);
    
    // Limpar input IMEDIATAMENTE
    setNewMessage('');
    setPendingMedia(null);
    
    // Enviar em background (não bloqueia UI)
    supabase.functions.invoke('whatsapp-send-message', {
      body: {
        conversation_id: selectedConversation.id,
        message: messageToSend || undefined,
        media_url: mediaToSend?.url,
        media_type: mediaToSend?.type,
        config_id: selectedConversation.config_id,
      },
    }).then(async ({ data, error }) => {
      // Handle edge function errors (including 400 responses)
      if (error || data?.error) {
        // Mark message as failed
        setMessages(prev => prev.map(m => 
          m.id === tempId ? { ...m, status: 'failed' } : m
        ));
        
        // Try to extract error details from FunctionsHttpError context
        let errorData = data;
        if (error && 'context' in error) {
          try {
            // FunctionsHttpError has the response body in context
            const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
            if (context?.json) {
              errorData = await context.json();
            }
          } catch (e) {
            console.error('Failed to parse error context:', e);
          }
        }
        
        console.error('Error sending message:', errorData || error);
        
        // Check for specific error types
        if (errorData?.invalid_number) {
          toast({
            title: 'Número Inválido',
            description: errorData.error || 'Este número não está no WhatsApp.',
            variant: 'destructive',
          });
          return;
        }
        
        if (errorData?.disconnected || data?.disconnected) {
          toast({
            title: `WhatsApp Desconectado: ${errorData?.instance_name || data?.instance_name || 'Instância'}`,
            description: 'Acesse o painel UAZAPI e reconecte esta instância.',
            variant: 'destructive',
          });
          return;
        }
        
        toast({
          title: 'Erro ao enviar',
          description: errorData?.error || data?.error || error?.message || 'Não foi possível enviar a mensagem.',
          variant: 'destructive',
        });
        return;
      }
      
      // Sucesso - atualizar status para 'sent'
      setMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, status: 'sent' } : m
      ));
    }).catch((err) => {
      console.error('Error sending message (catch):', err);
      setMessages(prev => prev.map(m => 
        m.id === tempId ? { ...m, status: 'failed' } : m
      ));
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    });
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

  const handleSaveReminder = async (date: Date) => {
    if (!selectedConversation) return;
    
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ 
        reminder_at: date.toISOString(), 
        updated_at: new Date().toISOString() 
      })
      .eq('id', selectedConversation.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível agendar o lembrete.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Lembrete agendado!',
        description: `Você será lembrado em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      });
      loadConversations();
      setSelectedConversation(prev => prev ? { 
        ...prev, 
        reminder_at: date.toISOString() 
      } : null);
    }
  };

  const handleRemoveReminder = async () => {
    if (!selectedConversation) return;
    
    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({ 
        reminder_at: null, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', selectedConversation.id);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o lembrete.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Lembrete removido',
      });
      loadConversations();
      setSelectedConversation(prev => prev ? { 
        ...prev, 
        reminder_at: null 
      } : null);
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
    const d = new Date(date);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
      return time;
    } else if (isYesterday) {
      return `Ontem ${time}`;
    } else {
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + time;
    }
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

  // Formata o preview da mensagem - usa helper que sabe extrair texto de JSON
  const formatPreview = (preview: string | null) => {
    if (!preview) return 'Sem mensagens';
    if (isBroadcastTemplate(preview)) return '📢 Broadcast enviado';
    
    // Usar formatMessagePreview para extrair texto de JSON ou formatar mídia
    const formatted = formatMessagePreview(preview, 'text');
    return formatted || preview;
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
      {/* Header - Mobile */}
      <div className="border-b p-2 flex items-center gap-2 md:hidden">
        {selectedConversation ? (
          <>
            {/* Back Button */}
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedConversation(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            
            {/* Avatar + Name */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Avatar className="h-7 w-7 shrink-0">
                {selectedConversation.avatar_url && (
                  <AvatarImage src={selectedConversation.avatar_url} />
                )}
                <AvatarFallback className="text-[10px] bg-muted">
                  {selectedConversation.name?.charAt(0) || selectedConversation.phone.slice(-2)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium truncate block">
                  {selectedConversation.name || selectedConversation.phone}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Assigned user badge OR Assumir button */}
              {selectedConversation.assigned_to ? (
                assignedUserNames[selectedConversation.assigned_to] && (
                  <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                    {assignedUserNames[selectedConversation.assigned_to]}
                  </Badge>
                )
              ) : (
                <Button 
                  variant="default" 
                  size="icon"
                  className="h-7 w-7"
                  onClick={async () => {
                    if (!user?.id) return;
                    const { error } = await supabase
                      .from('whatsapp_conversations')
                      .update({
                        assigned_to: user.id,
                        assigned_at: new Date().toISOString(),
                      })
                      .eq('id', selectedConversation.id);
                    if (error) {
                      toast({ title: 'Erro ao assumir lead', variant: 'destructive' });
                      return;
                    }
                    toast({ title: 'Lead assumido!' });
                    loadConversations();
                    const { data } = await supabase
                      .from('whatsapp_conversations')
                      .select('*')
                      .eq('id', selectedConversation.id)
                      .single();
                    if (data) {
                      setSelectedConversation(prev => ({
                        ...prev!,
                        ...data,
                        instance: prev?.instance
                      }));
                    }
                  }}
                  title="Assumir lead"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              )}

              {/* LeadControlPanelCompact - Mobile mode with single menu */}
              <LeadControlPanelCompact 
                isMobile={true}
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
                  reminder_at: selectedConversation.reminder_at,
                  assigned_to: selectedConversation.assigned_to,
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
                onReminderClick={() => setReminderModalOpen(true)}
                onAssignToMe={async () => {
                  if (!user?.id) return;
                  const { error } = await supabase
                    .from('whatsapp_conversations')
                    .update({
                      assigned_to: user.id,
                      assigned_at: new Date().toISOString(),
                    })
                    .eq('id', selectedConversation.id);
                  if (error) {
                    toast({ title: 'Erro ao assumir lead', variant: 'destructive' });
                    return;
                  }
                  toast({ title: 'Lead assumido!' });
                  loadConversations();
                  const { data } = await supabase
                    .from('whatsapp_conversations')
                    .select('*')
                    .eq('id', selectedConversation.id)
                    .single();
                  if (data) {
                    setSelectedConversation(prev => ({
                      ...prev!,
                      ...data,
                      instance: prev?.instance
                    }));
                  }
                }}
                onTransferUser={() => setTransferUserModalOpen(true)}
                onTransferInstance={instances.length > 1 ? () => setTransferModalOpen(true) : undefined}
                onMarkUnread={() => markAsUnread(selectedConversation.id)}
                hasMultipleInstances={instances.length > 1}
                instanceDisconnected={selectedConversation.instance && !selectedConversation.instance.is_active}
                initialNotes={selectedConversation.notes || null}
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold flex-1">Chat WhatsApp</h1>
            {instances.length > 1 && (
              <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                <SelectTrigger className="w-[140px]">
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
          </>
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

          <div className="flex-1 overflow-hidden">
            <VirtualizedConversationList
              conversations={filteredConversations}
              selectedConversationId={selectedConversation?.id || null}
              onSelectConversation={setSelectedConversation}
              height={window.innerHeight - 220}
              formatTime={formatTime}
              formatPreview={formatPreview}
            />
          </div>
        </div>

        {/* Chat Area - mobile */}
        <div className={cn(
          "flex-1 flex flex-col bg-background w-full",
          selectedConversation ? "flex" : "hidden"
        )}>
          {selectedConversation ? (
            <>
              {/* Messages - Virtualized */}
              <div className="flex-1 overflow-hidden">
                <VirtualizedMessageList
                  messages={messages}
                  height={window.innerHeight - 180}
                  formatTime={formatTime}
                  formatDate={formatDate}
                  onAddLead={(phone, name) => {
                    setQuickAddLeadPhone(phone);
                    setQuickAddLeadName(name);
                    setQuickAddLeadOpen(true);
                  }}
                />
              </div>

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
                    <Textarea
                      placeholder="Digite sua mensagem..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={sending}
                      className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
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

              <div ref={conversationListRef} className="flex-1 overflow-hidden">
                <VirtualizedConversationList
                  conversations={filteredConversations}
                  selectedConversationId={selectedConversation?.id || null}
                  onSelectConversation={setSelectedConversation}
                  height={conversationListHeight}
                  formatTime={formatTime}
                  formatPreview={formatPreview}
                />
              </div>
          </div>

          {/* Chat Panel - Flex grow to fill remaining space */}
          <div className="flex-1 h-full flex flex-col min-h-0 bg-background">
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

                      {/* Right: Simplified Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Assigned user badge OR Assumir button */}
                        {selectedConversation.assigned_to ? (
                          assignedUserNames[selectedConversation.assigned_to] && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                              {assignedUserNames[selectedConversation.assigned_to]}
                            </Badge>
                          )
                        ) : (
                          <Button 
                            variant="default" 
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={async () => {
                              if (!user?.id) return;
                              const { error } = await supabase
                                .from('whatsapp_conversations')
                                .update({
                                  assigned_to: user.id,
                                  assigned_at: new Date().toISOString(),
                                })
                                .eq('id', selectedConversation.id);
                              if (error) {
                                toast({ title: 'Erro ao assumir lead', variant: 'destructive' });
                                return;
                              }
                              toast({ title: 'Lead assumido!' });
                              loadConversations();
                              const { data } = await supabase
                                .from('whatsapp_conversations')
                                .select('*')
                                .eq('id', selectedConversation.id)
                                .single();
                              if (data) {
                                setSelectedConversation(prev => ({
                                  ...prev!,
                                  ...data,
                                  instance: prev?.instance
                                }));
                              }
                            }}
                            title="Assumir lead para você"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Assumir
                          </Button>
                        )}

                        {/* Lead Control Panel - contains all controls */}
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
                            reminder_at: selectedConversation.reminder_at,
                            assigned_to: selectedConversation.assigned_to,
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
                          onReminderClick={() => setReminderModalOpen(true)}
                          onAssignToMe={async () => {
                            if (!user?.id) return;
                            const { error } = await supabase
                              .from('whatsapp_conversations')
                              .update({
                                assigned_to: user.id,
                                assigned_at: new Date().toISOString(),
                              })
                              .eq('id', selectedConversation.id);
                            if (error) {
                              toast({ title: 'Erro ao assumir lead', variant: 'destructive' });
                              return;
                            }
                            toast({ title: 'Lead assumido!' });
                            loadConversations();
                            const { data } = await supabase
                              .from('whatsapp_conversations')
                              .select('*')
                              .eq('id', selectedConversation.id)
                              .single();
                            if (data) {
                              setSelectedConversation(prev => ({
                                ...prev!,
                                ...data,
                                instance: prev?.instance
                              }));
                            }
                          }}
                          onTransferUser={() => setTransferUserModalOpen(true)}
                          onTransferInstance={instances.length > 1 ? () => setTransferModalOpen(true) : undefined}
                          onMarkUnread={() => markAsUnread(selectedConversation.id)}
                          hasMultipleInstances={instances.length > 1}
                          instanceDisconnected={selectedConversation.instance && !selectedConversation.instance.is_active}
                          initialNotes={selectedConversation.notes || null}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Messages - Virtualized */}
                  <div ref={messageListRef} className="flex-1 overflow-hidden min-h-0">
                    <VirtualizedMessageList
                      messages={messages}
                      height={messageListHeight}
                      formatTime={formatTime}
                      formatDate={formatDate}
                      onAddLead={(phone, name) => {
                        setQuickAddLeadPhone(phone);
                        setQuickAddLeadName(name);
                        setQuickAddLeadOpen(true);
                      }}
                    />
                  </div>

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
                      
                      {/* Emoji Picker */}
                      <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                        <PopoverTrigger asChild>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon"
                            disabled={sending}
                          >
                            <Smile className="h-5 w-5 text-muted-foreground" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="w-auto p-0 border-0" 
                          side="top" 
                          align="start"
                        >
                          <EmojiPicker 
                            onEmojiClick={(emojiData: EmojiClickData) => {
                              setNewMessage(prev => prev + emojiData.emoji);
                              setEmojiPickerOpen(false);
                            }}
                            width={320}
                            height={400}
                          />
                        </PopoverContent>
                      </Popover>
                      
                      <div className="relative flex-1">
                        <Textarea
                          placeholder="Digite sua mensagem..."
                          value={newMessage}
                          onChange={(e) => setNewMessage(e.target.value)}
                          disabled={sending}
                          className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2"
                          rows={1}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
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

      {/* Reminder Modal */}
      {selectedConversation && (
        <ReminderModal
          open={reminderModalOpen}
          onOpenChange={setReminderModalOpen}
          leadName={selectedConversation.name || selectedConversation.phone}
          onSave={handleSaveReminder}
          onRemove={handleRemoveReminder}
          currentReminder={selectedConversation.reminder_at}
          lastContactAt={selectedConversation.last_message_at}
        />
      )}

      {/* Transfer User Modal */}
      {selectedConversation && (
        <TransferUserModal
          open={transferUserModalOpen}
          onOpenChange={setTransferUserModalOpen}
          conversationId={selectedConversation.id}
          conversationName={selectedConversation.name || selectedConversation.phone}
          currentAssignedTo={selectedConversation.assigned_to || null}
          onTransferComplete={() => {
            loadConversations();
            // Tentar atualizar a conversa selecionada
            // Se falhar (usuário perdeu acesso após transferir), desselecionar graciosamente
            supabase
              .from('whatsapp_conversations')
              .select('*')
              .eq('id', selectedConversation.id)
              .maybeSingle()
              .then(({ data, error }) => {
                if (error || !data) {
                  // Usuário não tem mais acesso a esta conversa (transferiu para outro)
                  // Desselecionar e informar
                  setSelectedConversation(null);
                  toast({
                    title: 'Conversa transferida',
                    description: 'A conversa saiu da sua fila de atendimento.',
                  });
                } else {
                  // Ainda tem acesso (admin ou conversa continua visível)
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

      {/* Quick Add Lead Modal */}
      <QuickAddLeadModal
        open={quickAddLeadOpen}
        onOpenChange={setQuickAddLeadOpen}
        initialPhone={quickAddLeadPhone}
        initialName={quickAddLeadName}
        defaultConfigId={selectedConversation?.config_id}
      />
    </div>
  );
}

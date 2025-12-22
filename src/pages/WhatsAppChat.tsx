import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Search, Bot, BotOff, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation, WhatsAppMessage, WhatsAppLabel } from '@/types/whatsapp';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

  // Auto-select conversation from URL phone parameter
  useEffect(() => {
    const phoneParam = searchParams.get('phone');
    if (phoneParam && conversations.length > 0 && !selectedConversation) {
      const normalizedParam = normalizePhone(phoneParam);
      const targetConv = conversations.find(c => 
        normalizePhone(c.phone) === normalizedParam
      );
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
      // 1. Buscar telefones da fila de disparos
      const { data: queuePhones } = await supabase
        .from('whatsapp_queue')
        .select('phone');

      // 2. Buscar lead_data das broadcast_lists
      const { data: lists } = await supabase
        .from('broadcast_lists')
        .select('lead_data, phones');

      // 3. Extrair todos os telefones de broadcast (normalizados)
      const broadcastPhones = new Set<string>();
      
      // Telefones da queue (normalizados)
      queuePhones?.forEach(q => broadcastPhones.add(normalizePhone(q.phone)));
      
      // Telefones das listas (lead_data e phones) - normalizados
      lists?.forEach(list => {
        const leadData = list.lead_data as Array<{ phone?: string }> | null;
        leadData?.forEach(lead => {
          if (lead.phone) broadcastPhones.add(normalizePhone(lead.phone));
        });
        list.phones?.forEach(phone => broadcastPhones.add(normalizePhone(phone)));
      });

      // 4. Buscar todas as conversas com config_id
      const { data: allConversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // 5. Buscar instâncias
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

      // 6. Filtrar conversas com números de broadcast (comparação normalizada)
      const filtered = (allConversations || [])
        .filter(conv => broadcastPhones.has(normalizePhone(conv.phone)))
        .map(conv => ({
          ...conv,
          instance: conv.config_id ? instanceMap.get(conv.config_id) : undefined,
        })) as ConversationWithInstance[];

      setConversations(filtered);
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

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConversation) return;

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('whatsapp-send-message', {
        body: {
          conversation_id: selectedConversation.id,
          message: newMessage.trim(),
          config_id: selectedConversation.config_id, // Use the conversation's instance
        },
      });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar a mensagem.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const toggleAI = async (conversation: ConversationWithInstance) => {
    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ ai_paused: !conversation.ai_paused })
        .eq('id', conversation.id);

      setSelectedConversation(prev => prev ? { ...prev, ai_paused: !prev.ai_paused } : null);
      loadConversations();

      toast({
        title: conversation.ai_paused ? 'IA Ativada' : 'IA Pausada',
        description: conversation.ai_paused 
          ? 'A IA voltará a responder automaticamente.' 
          : 'Você assumiu o controle da conversa.',
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

  const filteredConversations = conversations.filter(conv => {
    const matchesSearch = conv.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      conv.phone.includes(searchTerm);
    
    const matchesInstance = selectedInstance === 'all' || conv.config_id === selectedInstance;
    
    return matchesSearch && matchesInstance;
  });

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
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
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

      <div className="flex flex-1 overflow-hidden">
        {/* Conversations List - hidden on mobile when conversation selected */}
        <div className={cn(
          "border-r flex flex-col bg-background",
          "w-full md:w-80 lg:w-96",
          selectedConversation ? "hidden md:flex" : "flex"
        )}>
          {/* Desktop Filter */}
          <div className="hidden md:flex items-center gap-2 p-3 border-b">
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

          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={cn(
                  'p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors',
                  selectedConversation?.id === conv.id && 'bg-muted'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {conv.name?.charAt(0).toUpperCase() || conv.phone.slice(-2)}
                      </AvatarFallback>
                    </Avatar>
                    {conv.instance && (
                      <div 
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                        style={{ backgroundColor: conv.instance.color }}
                        title={conv.instance.name}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">
                        {conv.name || conv.phone}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {formatPreview(conv.last_message_preview)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {conv.tags?.slice(0, 1).map((tag) => (
                        <Badge key={tag} variant="secondary" className={cn('text-xs px-1.5 py-0', getLabelColor(tag))}>
                          {getLabelName(tag)}
                        </Badge>
                      ))}
                      <div className="flex items-center gap-1 ml-auto">
                        {conv.ai_paused && (
                          <BotOff className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        {(conv.unread_count ?? 0) > 0 && (
                          <Badge className="h-5 min-w-5 flex items-center justify-center text-xs">
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

        {/* Chat Area - hidden on mobile when no conversation selected */}
        <div className={cn(
          "flex-1 flex flex-col bg-background",
          selectedConversation ? "flex" : "hidden md:flex"
        )}>
          {selectedConversation ? (
            <>
              {/* Chat Header - hidden on mobile (using top header instead) */}
              <div className="border-b p-3 hidden md:flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>
                        {selectedConversation.name?.charAt(0).toUpperCase() || selectedConversation.phone.slice(-2)}
                      </AvatarFallback>
                    </Avatar>
                    {selectedConversation.instance && (
                      <div 
                        className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
                        style={{ backgroundColor: selectedConversation.instance.color }}
                      />
                    )}
                  </div>
                  <div>
                    <h2 className="font-medium text-sm">
                      {selectedConversation.name || selectedConversation.phone}
                    </h2>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {selectedConversation.phone}
                      </span>
                      {selectedConversation.instance && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ borderColor: selectedConversation.instance.color, color: selectedConversation.instance.color }}
                        >
                          via {selectedConversation.instance.name}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant={selectedConversation.ai_paused ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => toggleAI(selectedConversation)}
                    className="gap-1 text-xs h-8"
                  >
                    {selectedConversation.ai_paused ? (
                      <>
                        <BotOff className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">IA Pausada</span>
                      </>
                    ) : (
                      <>
                        <Bot className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">IA Ativa</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Mobile AI Toggle */}
              <div className="md:hidden border-b p-2 flex items-center justify-end gap-2">
                <Button
                  variant={selectedConversation.ai_paused ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => toggleAI(selectedConversation)}
                  className="gap-1 text-xs h-7"
                >
                  {selectedConversation.ai_paused ? (
                    <>
                      <BotOff className="h-3.5 w-3.5" />
                      IA Pausada
                    </>
                  ) : (
                    <>
                      <Bot className="h-3.5 w-3.5" />
                      IA Ativa
                    </>
                  )}
                </Button>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-3 md:p-4">
                <div className="space-y-3">
                  {messages.map((msg, index) => {
                    const showDate = index === 0 || 
                      formatDate(messages[index - 1].created_at) !== formatDate(msg.created_at);

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <Badge variant="secondary" className="text-xs">
                              {formatDate(msg.created_at)}
                            </Badge>
                          </div>
                        )}
                        <div className={cn(
                          'flex',
                          msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                        )}>
                          <div className={cn(
                            'max-w-[85%] md:max-w-[70%] rounded-lg px-3 py-2',
                            msg.direction === 'outgoing'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}>
                            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                            <span className={cn(
                              'text-xs mt-1 block text-right',
                              msg.direction === 'outgoing' ? 'text-primary-foreground/70' : 'text-muted-foreground'
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

              {/* Message Input */}
              <div className="border-t p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="Digite sua mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
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
    </div>
  );
}

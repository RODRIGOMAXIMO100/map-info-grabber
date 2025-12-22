import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, Search, Bot, BotOff, Phone, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation, WhatsAppMessage, WhatsAppLabel } from '@/types/whatsapp';

export default function WhatsAppChat() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [labels, setLabels] = useState<WhatsAppLabel[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadConversations();
    loadLabels();
    
    // Subscribe to realtime updates
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

      // Subscribe to messages for selected conversation
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

      // 3. Extrair todos os telefones de broadcast
      const broadcastPhones = new Set<string>();
      
      // Telefones da queue
      queuePhones?.forEach(q => broadcastPhones.add(q.phone));
      
      // Telefones das listas (lead_data e phones)
      lists?.forEach(list => {
        // lead_data é um array de objetos com phone
        const leadData = list.lead_data as Array<{ phone?: string }> | null;
        leadData?.forEach(lead => {
          if (lead.phone) broadcastPhones.add(lead.phone);
        });
        // phones é um array direto de telefones
        list.phones?.forEach(phone => broadcastPhones.add(phone));
      });

      // 4. Buscar todas as conversas
      const { data: allConversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      // 5. Filtrar apenas conversas com números de broadcast
      const filtered = allConversations?.filter(conv => 
        broadcastPhones.has(conv.phone)
      ) || [];

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

  const toggleAI = async (conversation: WhatsAppConversation) => {
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

  const filteredConversations = conversations.filter(conv =>
    conv.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.phone.includes(searchTerm)
  );

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Chat WhatsApp</h1>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Conversations List */}
        <div className="w-80 border-r flex flex-col">
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
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {conv.name?.charAt(0).toUpperCase() || conv.phone.slice(-2)}
                    </AvatarFallback>
                  </Avatar>
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
                      {conv.last_message_preview}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {conv.tags?.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className={cn('text-xs', getLabelColor(tag))}>
                          {getLabelName(tag)}
                        </Badge>
                      ))}
                      {conv.unread_count > 0 && (
                        <Badge className="ml-auto">{conv.unread_count}</Badge>
                      )}
                      {conv.ai_paused && (
                        <BotOff className="h-3 w-3 text-muted-foreground" />
                      )}
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

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="border-b p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {selectedConversation.name?.charAt(0).toUpperCase() || selectedConversation.phone.slice(-2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-medium">
                      {selectedConversation.name || selectedConversation.phone}
                    </h2>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {selectedConversation.phone}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={selectedConversation.ai_paused ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => toggleAI(selectedConversation)}
                    className="gap-2"
                  >
                    {selectedConversation.ai_paused ? (
                      <>
                        <BotOff className="h-4 w-4" />
                        IA Pausada
                      </>
                    ) : (
                      <>
                        <Bot className="h-4 w-4" />
                        IA Ativa
                      </>
                    )}
                  </Button>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg, index) => {
                    const showDate = index === 0 || 
                      formatDate(messages[index - 1].created_at) !== formatDate(msg.created_at);

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-4">
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
                            'max-w-[70%] rounded-lg px-4 py-2',
                            msg.direction === 'outgoing'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}>
                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
              <div className="border-t p-4">
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
                  <Button type="submit" disabled={sending || !newMessage.trim()}>
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
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Selecione uma conversa para começar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation, CRMStage } from '@/types/whatsapp';
import { CRM_STAGES } from '@/types/whatsapp';

export default function CRMKanban() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<WhatsAppConversation | null>(null);

  useEffect(() => {
    loadConversations();

    const channel = supabase
      .channel('crm-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations' }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const normalizePhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 10) {
      return digits.slice(2);
    }
    return digits;
  };

  const formatPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      const ddd = digits.slice(-11, -9) || digits.slice(0, 2);
      const rest = digits.slice(-9);
      if (rest.length === 9) {
        return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
      }
      return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return phone;
  };

  const getUrgencyColor = (lastMessageAt: string | null): string => {
    if (!lastMessageAt) return 'border-l-muted';
    const hours = (Date.now() - new Date(lastMessageAt).getTime()) / 3600000;
    if (hours < 1) return 'border-l-green-500';
    if (hours < 4) return 'border-l-yellow-500';
    if (hours < 24) return 'border-l-orange-500';
    return 'border-l-red-500';
  };

  const loadConversations = async () => {
    try {
      const { data: queuePhones } = await supabase
        .from('whatsapp_queue')
        .select('phone');

      const { data: lists } = await supabase
        .from('broadcast_lists')
        .select('lead_data, phones');

      const broadcastPhones = new Set<string>();
      
      queuePhones?.forEach(q => broadcastPhones.add(normalizePhone(q.phone)));
      
      lists?.forEach(list => {
        const leadData = list.lead_data as Array<{ phone?: string }> | null;
        leadData?.forEach(lead => {
          if (lead.phone) broadcastPhones.add(normalizePhone(lead.phone));
        });
        list.phones?.forEach(phone => broadcastPhones.add(normalizePhone(phone)));
      });

      const { data: allConversations, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const filtered = allConversations?.filter(conv => 
        broadcastPhones.has(normalizePhone(conv.phone))
      ) || [];

      setConversations(filtered);
    } catch (error) {
      console.error('Error loading conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getConversationsForStage = (stage: CRMStage) => {
    return conversations.filter(conv => 
      conv.tags?.includes(stage.label_id)
    );
  };

  const getUnclassifiedConversations = () => {
    const allStageLabels = CRM_STAGES.map(s => s.label_id);
    return conversations.filter(conv => 
      !conv.tags?.some(tag => allStageLabels.includes(tag))
    );
  };

  const handleDragStart = (conv: WhatsAppConversation) => {
    setDraggedItem(conv);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (targetStage: CRMStage) => {
    if (!draggedItem) return;

    try {
      const funnelLabelIds = CRM_STAGES.map(s => s.label_id);
      const nonFunnelTags = (draggedItem.tags || []).filter(tag => !funnelLabelIds.includes(tag));
      const newTags = [...nonFunnelTags, targetStage.label_id];

      await supabase
        .from('whatsapp_conversations')
        .update({ tags: newTags, updated_at: new Date().toISOString() })
        .eq('id', draggedItem.id);

      toast({
        title: 'Lead movido',
        description: `${draggedItem.name || draggedItem.phone} movido para ${targetStage.name}`,
      });

      loadConversations();
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

  const getStageColor = (stage: CRMStage) => {
    const colors: Record<number, string> = {
      1: 'border-t-blue-500',
      2: 'border-t-cyan-500',
      3: 'border-t-yellow-500',
      4: 'border-t-orange-500',
      5: 'border-t-purple-500',
      6: 'border-t-green-500',
      7: 'border-t-emerald-600',
    };
    return colors[stage.order] || 'border-t-gray-500';
  };

  const isAIControlled = (stage: CRMStage) => stage.is_ai_controlled;

  const formatTime = (date: string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  // Componente do cartão compacto estilo Pipedrive
  const LeadCard = ({ conv }: { conv: WhatsAppConversation }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            draggable
            onDragStart={() => handleDragStart(conv)}
            className={cn(
              'cursor-grab active:cursor-grabbing hover:shadow-md transition-all border-l-4',
              getUrgencyColor(conv.last_message_at),
              draggedItem?.id === conv.id && 'opacity-50'
            )}
          >
            <CardContent className="p-2">
              {/* Linha 1: Nome + Ações */}
              <div className="flex items-center justify-between gap-1">
                <span className="font-medium text-sm truncate flex-1">
                  {conv.name || formatPhone(conv.phone)}
                </span>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 hover:bg-green-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/whatsapp/chat?phone=${encodeURIComponent(conv.phone)}`);
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <a href={`tel:${conv.phone}`} onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-6 w-6 hover:bg-blue-100">
                      <Phone className="h-3.5 w-3.5 text-blue-600" />
                    </Button>
                  </a>
                </div>
              </div>

              {/* Linha 2: Telefone formatado */}
              <div className="text-xs text-muted-foreground truncate">
                📱 {formatPhone(conv.phone)}
              </div>

              {/* Linha 3: Badges + Tempo */}
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <Badge 
                    variant={conv.ai_paused ? "outline" : "secondary"} 
                    className="text-[10px] h-4 px-1"
                  >
                    {conv.ai_paused ? '👤' : '🤖'}
                  </Badge>
                  {(conv.unread_count ?? 0) > 0 && (
                    <Badge className="text-[10px] h-4 px-1 bg-red-500 text-white">
                      {conv.unread_count}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(conv.last_message_at)}
                </span>
              </div>
            </CardContent>
          </Card>
        </TooltipTrigger>
        {conv.last_message_preview && (
          <TooltipContent side="right" className="max-w-[200px]">
            <p className="text-xs">{conv.last_message_preview}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const unclassified = getUnclassifiedConversations();

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">CRM Kanban</h1>
          <Badge variant="secondary" className="text-xs">
            {conversations.length} leads
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={loadConversations} className="gap-1">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {/* Legenda de urgência */}
      <div className="px-3 py-1.5 flex items-center gap-3 text-[10px] text-muted-foreground border-b">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> &lt;1h</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span> 1-4h</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span> 4-24h</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> &gt;24h</span>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 p-3 h-full min-w-max">
          {/* Unclassified Column */}
          {unclassified.length > 0 && (
            <div className="w-56 sm:w-64 flex-shrink-0 flex flex-col">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="font-medium text-sm text-muted-foreground">Não Classificados</h3>
                <Badge variant="secondary" className="text-xs">{unclassified.length}</Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-1.5 pr-2">
                  {unclassified.map((conv) => (
                    <LeadCard key={conv.id} conv={conv} />
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Stage Columns */}
          {CRM_STAGES.map((stage) => {
            const stageConversations = getConversationsForStage(stage);

            return (
              <div
                key={stage.id}
                className="w-56 sm:w-64 flex-shrink-0 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage)}
              >
                <div className={cn(
                  'mb-2 flex items-center justify-between p-2 rounded-lg border-t-4 bg-muted/50',
                  getStageColor(stage)
                )}>
                  <div className="flex flex-col">
                    <h3 className="font-medium text-sm">{stage.name}</h3>
                    <span className="text-[10px] text-muted-foreground">
                      {isAIControlled(stage) ? '🤖 IA' : '👤 Vendedor'}
                    </span>
                  </div>
                  <Badge className="text-xs">{stageConversations.length}</Badge>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-1.5 pr-2 min-h-[100px]">
                    {stageConversations.map((conv) => (
                      <LeadCard key={conv.id} conv={conv} />
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
    </div>
  );
}
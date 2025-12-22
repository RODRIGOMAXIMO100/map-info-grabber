import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Phone, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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

    // Subscribe to realtime updates
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

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
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
      // Remove all funnel labels and add new one
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
      1: 'border-t-blue-500',      // Lead Novo
      2: 'border-t-cyan-500',      // MQL
      3: 'border-t-yellow-500',    // Engajado
      4: 'border-t-orange-500',    // SQL
      5: 'border-t-purple-500',    // Handoff
      6: 'border-t-green-500',     // Negociação
      7: 'border-t-emerald-600',   // Fechado
    };
    return colors[stage.order] || 'border-t-gray-500';
  };

  const isAIControlled = (stage: CRMStage) => stage.is_ai_controlled;

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const unclassified = getUnclassifiedConversations();

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">CRM Kanban</h1>
            <p className="text-muted-foreground">
              {conversations.length} leads no funil
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadConversations} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 min-w-max h-full">
          {/* Unclassified Column */}
          {unclassified.length > 0 && (
            <div className="w-80 flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-muted-foreground">Não Classificados</h3>
                <Badge variant="secondary">{unclassified.length}</Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-2">
                  {unclassified.map((conv) => (
                    <Card
                      key={conv.id}
                      draggable
                      onDragStart={() => handleDragStart(conv)}
                      className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <span className="font-medium truncate">
                            {conv.name || conv.phone}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(conv.last_message_at)}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate mb-2">
                          {conv.last_message_preview}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => navigate('/whatsapp/chat')}
                          >
                            <MessageCircle className="h-3 w-3" />
                          </Button>
                          <a href={`tel:${conv.phone}`}>
                            <Button size="sm" variant="ghost" className="h-7 px-2">
                              <Phone className="h-3 w-3" />
                            </Button>
                          </a>
                        </div>
                      </CardContent>
                    </Card>
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
                className="w-80 flex flex-col"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage)}
              >
                <div className={cn(
                  'mb-3 flex items-center justify-between p-3 rounded-lg border-t-4 bg-muted/50',
                  getStageColor(stage)
                )}>
                  <div className="flex flex-col">
                    <h3 className="font-semibold">{stage.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {isAIControlled(stage) ? '🤖 IA' : '👤 Vendedor'}
                    </span>
                  </div>
                  <Badge>{stageConversations.length}</Badge>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-2 min-h-[200px]">
                    {stageConversations.map((conv) => (
                      <Card
                        key={conv.id}
                        draggable
                        onDragStart={() => handleDragStart(conv)}
                        className={cn(
                          'cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow',
                          draggedItem?.id === conv.id && 'opacity-50'
                        )}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-medium truncate">
                              {conv.name || conv.phone}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(conv.last_message_at)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mb-2">
                            {conv.last_message_preview}
                          </p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {conv.ai_paused ? (
                                <Badge variant="outline" className="text-xs">Manual</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">IA</Badge>
                              )}
                              {conv.unread_count > 0 && (
                                <Badge className="text-xs">{conv.unread_count}</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => navigate('/whatsapp/chat')}
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                              <a href={`tel:${conv.phone}`}>
                                <Button size="sm" variant="ghost" className="h-7 px-2">
                                  <Phone className="h-3 w-3" />
                                </Button>
                              </a>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {stageConversations.length === 0 && (
                      <div className="flex items-center justify-center h-32 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
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

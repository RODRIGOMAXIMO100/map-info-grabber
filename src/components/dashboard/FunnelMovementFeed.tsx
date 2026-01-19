import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, ArrowDown, ArrowRight, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StageInfo {
  id: string;
  name: string;
  color: string;
  stage_order: number;
}

interface Movement {
  id: string;
  conversation_id: string;
  from_stage_id: string | null;
  to_stage_id: string | null;
  changed_at: string;
  conversation_name: string | null;
  conversation_phone: string;
  from_stage: StageInfo | null;
  to_stage: StageInfo | null;
}

interface FunnelMovementFeedProps {
  funnelId: string;
  startDate: Date | null;
  endDate?: Date | null;
}

export default function FunnelMovementFeed({ funnelId, startDate, endDate }: FunnelMovementFeedProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMovements = async () => {
    try {
      // Carregar estágios do funil
      const { data: stagesData } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, color, stage_order')
        .eq('funnel_id', funnelId);

      const stagesMap = new Map<string, StageInfo>();
      (stagesData || []).forEach(stage => {
        stagesMap.set(stage.id, stage as StageInfo);
      });

      // Carregar movimentações recentes
      let query = supabase
        .from('funnel_stage_history')
        .select(`
          id,
          conversation_id,
          from_stage_id,
          to_stage_id,
          changed_at
        `)
        .order('changed_at', { ascending: false })
        .limit(20);

      if (startDate) {
        query = query.gte('changed_at', startDate.toISOString());
      }
      
      if (endDate) {
        query = query.lte('changed_at', endDate.toISOString());
      }

      const { data: historyData } = await query;

      if (!historyData || historyData.length === 0) {
        setMovements([]);
        setLoading(false);
        return;
      }

      // Buscar informações das conversas
      const conversationIds = [...new Set(historyData.map(h => h.conversation_id))];
      const { data: conversationsData } = await supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, crm_funnel_id')
        .in('id', conversationIds)
        .eq('crm_funnel_id', funnelId);

      const conversationsMap = new Map<string, { name: string | null; phone: string }>();
      (conversationsData || []).forEach(conv => {
        conversationsMap.set(conv.id, { name: conv.name, phone: conv.phone });
      });

      // Montar lista de movimentações
      const movementsList: Movement[] = historyData
        .filter(h => {
          // Filtrar apenas movimentações de conversas deste funil
          const conv = conversationsMap.get(h.conversation_id);
          return conv !== undefined;
        })
        .map(h => {
          const conv = conversationsMap.get(h.conversation_id);
          return {
            id: h.id,
            conversation_id: h.conversation_id,
            from_stage_id: h.from_stage_id,
            to_stage_id: h.to_stage_id,
            changed_at: h.changed_at,
            conversation_name: conv?.name || null,
            conversation_phone: conv?.phone || '',
            from_stage: h.from_stage_id ? stagesMap.get(h.from_stage_id) || null : null,
            to_stage: h.to_stage_id ? stagesMap.get(h.to_stage_id) || null : null,
          };
        });

      setMovements(movementsList);
    } catch (error) {
      console.error('Error loading movements:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovements();
  }, [funnelId, startDate, endDate]);

  // Centralized realtime subscription for new movements
  useRealtimeRefresh(
    'funnel_stage_history',
    useCallback(() => {
      loadMovements();
    }, [funnelId, startDate, endDate]),
    { event: 'INSERT' }
  );

  const getDirectionIcon = (fromStage: StageInfo | null, toStage: StageInfo | null) => {
    if (!fromStage) {
      return <ArrowRight className="h-4 w-4 text-blue-500" />;
    }
    if (!toStage) {
      return <ArrowDown className="h-4 w-4 text-red-500" />;
    }
    if (toStage.stage_order > fromStage.stage_order) {
      return <ArrowUp className="h-4 w-4 text-green-500" />;
    } else if (toStage.stage_order < fromStage.stage_order) {
      return <ArrowDown className="h-4 w-4 text-red-500" />;
    }
    return <ArrowRight className="h-4 w-4 text-yellow-500" />;
  };

  const getDirectionBadge = (fromStage: StageInfo | null, toStage: StageInfo | null) => {
    if (!fromStage) {
      return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">Entrada</Badge>;
    }
    if (!toStage) {
      return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Saída</Badge>;
    }
    if (toStage.stage_order > fromStage.stage_order) {
      return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Avanço</Badge>;
    } else if (toStage.stage_order < fromStage.stage_order) {
      return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Retrocesso</Badge>;
    }
    return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">Lateral</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Movimentações do Funil
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Movimentações do Funil
        </CardTitle>
      </CardHeader>
      <CardContent>
        {movements.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p>Nenhuma movimentação registrada</p>
            <p className="text-xs mt-1">As movimentações aparecerão aqui quando leads mudarem de estágio</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {movements.map((movement) => (
                <div 
                  key={movement.id} 
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="mt-1">
                    {getDirectionIcon(movement.from_stage, movement.to_stage)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {movement.conversation_name || movement.conversation_phone}
                      </span>
                      {getDirectionBadge(movement.from_stage, movement.to_stage)}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {movement.from_stage ? (
                        <span 
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: `${movement.from_stage.color}20`,
                            color: movement.from_stage.color,
                            border: `1px solid ${movement.from_stage.color}40`
                          }}
                        >
                          {movement.from_stage.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Novo</span>
                      )}
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {movement.to_stage ? (
                        <span 
                          className="px-2 py-0.5 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: `${movement.to_stage.color}20`,
                            color: movement.to_stage.color,
                            border: `1px solid ${movement.to_stage.color}40`
                          }}
                        >
                          {movement.to_stage.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Removido</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(movement.changed_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

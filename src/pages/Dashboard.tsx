import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { 
  Users, 
  UserCheck, 
  MessageSquare, 
  AlertCircle, 
  TrendingUp,
  Send,
  Bot,
  Clock,
  Calendar,
  
  DollarSign
} from "lucide-react";
import InstanceMonitor from "@/components/InstanceMonitor";
import { CRM_STAGES, CRMStage } from "@/types/whatsapp";

type DateFilter = 'today' | '7days' | '30days' | 'all';

interface StageCount extends CRMStage {
  count: number;
  hexColor: string;
}

interface RecentHandoff {
  id: string;
  name: string | null;
  phone: string;
  reason: string | null;
  time: string;
}

// Mapa de cores para cada estágio (baseado no color number do CRM_STAGES)
const STAGE_COLORS: Record<number, string> = {
  1: '#6B7280', // Lead Novo - cinza
  2: '#3B82F6', // Levantamento - azul
  3: '#8B5CF6', // Apresentação - roxo
  4: '#F59E0B', // Interesse - amarelo
  5: '#EF4444', // Handoff - vermelho
  6: '#10B981', // Negociando - verde
  7: '#22C55E', // Convertido - verde claro
  8: '#9CA3AF', // Perdido - cinza claro
};

const getStartDate = (filter: DateFilter): Date | null => {
  const now = new Date();
  switch (filter) {
    case 'today':
      now.setHours(0, 0, 0, 0);
      return now;
    case '7days':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30days':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
};

export default function Dashboard() {
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [recentHandoffs, setRecentHandoffs] = useState<RecentHandoff[]>([]);
  const [aiActive, setAiActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    todayMessages: 0,
    broadcastsSent: 0,
    aiResponses: 0,
    pipelineValue: 0,
  });

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations' },
        () => loadDashboardData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dateFilter]);

  const loadDashboardData = async () => {
    try {
      const startDate = getStartDate(dateFilter);

      // Buscar conversas CRM com filtro de período
      let conversationsQuery = supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('is_crm_lead', true)
        .order('last_message_at', { ascending: false });
      
      if (startDate) {
        conversationsQuery = conversationsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: conversations } = await conversationsQuery;
      const filteredConversations = conversations || [];

      // Contagens por estágio usando CRM_STAGES
      const counts: Record<string, number> = {};
      CRM_STAGES.forEach(stage => {
        counts[stage.id] = 0;
      });

      let pipelineValue = 0;
      filteredConversations.forEach(conv => {
        const stage = conv.funnel_stage || 'new';
        if (counts[stage] !== undefined) {
          counts[stage]++;
        } else {
          counts['new']++;
        }
        if (conv.estimated_value) {
          pipelineValue += Number(conv.estimated_value);
        }
      });

      // Mapear CRM_STAGES com contagens
      const stageCountsData: StageCount[] = CRM_STAGES.map(stage => ({
        ...stage,
        count: counts[stage.id] || 0,
        hexColor: STAGE_COLORS[stage.color] || '#6B7280',
      }));

      // Handoffs recentes
      const handoffs = filteredConversations
        .filter(c => c.funnel_stage === 'handoff')
        .slice(0, 5)
        .map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          reason: c.ai_handoff_reason,
          time: c.last_message_at ? new Date(c.last_message_at).toLocaleString('pt-BR') : '',
        }));

      // IDs das conversas
      const conversationIds = filteredConversations.map(c => c.id);

      // Mensagens de hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let todayMessagesCount = 0;
      if (conversationIds.length > 0) {
        const { count } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', conversationIds)
          .gte('created_at', today.toISOString());
        todayMessagesCount = count || 0;
      }

      // Broadcasts enviados
      const { count: broadcastsSentCount } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');

      // Respostas da IA
      let aiResponsesCount = 0;
      if (conversationIds.length > 0) {
        const { count } = await supabase
          .from('whatsapp_ai_logs')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', conversationIds);
        aiResponsesCount = count || 0;
      }

      // Status da IA
      const { data: aiConfig } = await supabase
        .from('whatsapp_ai_config')
        .select('is_active')
        .limit(1)
        .maybeSingle();

      setStageCounts(stageCountsData);
      setRecentHandoffs(handoffs);
      setAiActive(aiConfig?.is_active || false);
      setMetrics({
        totalLeads: filteredConversations.length,
        todayMessages: todayMessagesCount || 0,
        broadcastsSent: broadcastsSentCount || 0,
        aiResponses: aiResponsesCount || 0,
        pipelineValue,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Taxa de avanço: leads que saíram de "Novo"
  const advancementRate = useMemo(() => {
    const newLeads = stageCounts.find(s => s.id === 'new')?.count || 0;
    const total = metrics.totalLeads;
    if (total === 0) return 0;
    return Math.round(((total - newLeads) / total) * 100);
  }, [stageCounts, metrics.totalLeads]);

  // Taxa de conversão geral (Lead Novo → Convertido)
  const overallConversionRate = useMemo(() => {
    const newLeads = stageCounts.find(s => s.id === 'new')?.count || 0;
    const converted = stageCounts.find(s => s.id === 'converted')?.count || 0;
    if (newLeads === 0) return 0;
    return Math.round((converted / newLeads) * 100);
  }, [stageCounts]);

  // Maior contagem para escala do funil
  const maxCount = useMemo(() => {
    return Math.max(...stageCounts.map(s => s.count), 1);
  }, [stageCounts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Pipeline de leads do CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <ToggleGroup 
            type="single" 
            value={dateFilter} 
            onValueChange={(value) => value && setDateFilter(value as DateFilter)}
            className="bg-muted rounded-lg p-1"
          >
            <ToggleGroupItem value="today" className="text-xs px-3">Hoje</ToggleGroupItem>
            <ToggleGroupItem value="7days" className="text-xs px-3">7 dias</ToggleGroupItem>
            <ToggleGroupItem value="30days" className="text-xs px-3">30 dias</ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs px-3">Tudo</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Cards de Métricas Resumo */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total CRM</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalLeads}</div>
            <p className="text-xs text-muted-foreground">Leads no funil</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Avanço</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{advancementRate}%</div>
            <p className="text-xs text-muted-foreground">Saíram de "Novo"</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão Geral</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallConversionRate}%</div>
            <p className="text-xs text-muted-foreground">Lead → Convertido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Pipeline</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.pipelineValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
            <p className="text-xs text-muted-foreground">Valor estimado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.todayMessages}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Respostas IA</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.aiResponses}</div>
          </CardContent>
        </Card>
      </div>

      {/* Funil Visual e Handoffs */}
      <div className="grid gap-4 md:grid-cols-7">
        {/* Funil Visual */}
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>Distribuição de leads por estágio do CRM</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4"></TableHead>
                  <TableHead className="w-40">Etapa</TableHead>
                  <TableHead>Distribuição</TableHead>
                  <TableHead className="text-right w-20 pr-4">Leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stageCounts.map((stage) => {
                  const widthPercentage = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                  const isAI = stage.is_ai_controlled;
                  
                  return (
                    <TableRow key={stage.id} className="hover:bg-muted/50">
                      <TableCell className="pl-4">
                        {isAI ? (
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{stage.name}</TableCell>
                      <TableCell>
                        <div className="w-full bg-muted rounded-full h-5 overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ 
                              width: `${Math.max(widthPercentage, stage.count > 0 ? 8 : 0)}%`,
                              backgroundColor: stage.hexColor 
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold pr-4">{stage.count}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {/* Legenda */}
            <div className="flex items-center justify-center gap-6 py-4 border-t">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                <span>IA (automático)</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserCheck className="h-4 w-4" />
                <span>Manual (vendedor)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Handoffs Recentes */}
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Handoffs Pendentes
              {recentHandoffs.length > 0 && (
                <Badge variant="destructive">{recentHandoffs.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>Leads aguardando atendimento humano</CardDescription>
          </CardHeader>
          <CardContent>
            {recentHandoffs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <UserCheck className="h-12 w-12 mb-2" />
                <p>Nenhum handoff pendente</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentHandoffs.map((handoff) => (
                  <div key={handoff.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {handoff.name || handoff.phone}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {handoff.reason || 'Sem motivo especificado'}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {handoff.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monitor de Instâncias WhatsApp */}
      <InstanceMonitor />

      {/* Status da IA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Status do Agente IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`h-3 w-3 rounded-full ${aiActive ? 'bg-green-500' : 'bg-muted-foreground'}`} />
            <span className="font-medium">
              {aiActive ? 'Agente ativo e respondendo' : 'Agente inativo'}
            </span>
            {!aiActive && (
              <Badge variant="outline">Configure em Agente IA</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

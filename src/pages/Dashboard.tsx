import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, differenceInDays, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

import { 
  Users, 
  UserCheck, 
  MessageSquare, 
  AlertCircle, 
  TrendingUp,
  Bot,
  Clock,
  DollarSign,
  CalendarRange
} from "lucide-react";
import InstanceMonitor from "@/components/InstanceMonitor";
import { 
  FunnelMovementFeed,
  FunnelEvolutionChart,
  PeriodComparison,
  CriticalLeadsAlert,
  AIMetricsCard,
  FunnelVelocity,
  ActivityHeatmap,
  StageTimeMetrics,
  SalesFunnelMetrics
} from "@/components/dashboard";
import type { CRMFunnel, CRMFunnelStage } from "@/types/crm";

interface StageCount {
  id: string;
  name: string;
  color: string;
  count: number;
  is_ai_controlled: boolean;
}

interface RecentHandoff {
  id: string;
  name: string | null;
  phone: string;
  reason: string | null;
  time: string;
}

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [recentHandoffs, setRecentHandoffs] = useState<RecentHandoff[]>([]);
  const [aiActive, setAiActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [funnels, setFunnels] = useState<CRMFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [stages, setStages] = useState<CRMFunnelStage[]>([]);
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    todayMessages: 0,
    broadcastsSent: 0,
    aiResponses: 0,
    pipelineValue: 0,
  });

  // Refs para detectar duplo-clique no calendário
  const lastClickedDayRef = useRef<Date | null>(null);
  const lastClickTsRef = useRef<number>(0);
  const ignoreNextSelectRef = useRef<boolean>(false);

  // Helper functions for date handling
  const getStartDate = (): Date | null => {
    if (dateRange.from) {
      return startOfDay(dateRange.from);
    }
    return null;
  };

  const getEndDate = (): Date | null => {
    if (dateRange.to) {
      return endOfDay(dateRange.to);
    }
    // Fallback: se from existe mas to não, usar from como end também
    if (dateRange.from) {
      return endOfDay(dateRange.from);
    }
    return null;
  };

  const getPeriodDays = (): number => {
    if (dateRange.from && dateRange.to) {
      return Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);
    }
    return 30;
  };

  // Apply preset date ranges
  const applyPreset = (preset: string) => {
    const now = new Date();
    const today = startOfDay(now);
    
    switch (preset) {
      case 'today':
        setDateRange({ from: today, to: now });
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        setDateRange({ from: yesterday, to: yesterday });
        break;
      case '7days':
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case '30days':
        setDateRange({ from: subDays(now, 30), to: now });
        break;
      case 'all':
        setDateRange({ from: new Date(2020, 0, 1), to: now });
        break;
    }
  };

  // Carregar funis na inicialização
  useEffect(() => {
    loadFunnels();
  }, []);

  // Carregar estágios quando o funil for selecionado
  useEffect(() => {
    if (selectedFunnelId) {
      loadStages(selectedFunnelId);
    }
  }, [selectedFunnelId]);

  // Carregar dados do dashboard quando estágios ou filtro mudarem
  useEffect(() => {
    if (stages.length > 0 && selectedFunnelId && dateRange.from) {
      loadDashboardData();
    }
  }, [stages, selectedFunnelId, dateRange]);

  // Configurar realtime
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations' },
        () => {
          if (stages.length > 0 && selectedFunnelId) {
            loadDashboardData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stages, selectedFunnelId]);

  const loadFunnels = async () => {
    try {
      const { data } = await supabase
        .from('crm_funnels')
        .select('*')
        .order('is_default', { ascending: false });
      
      if (data && data.length > 0) {
        setFunnels(data as CRMFunnel[]);
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
      const { data } = await supabase
        .from('crm_funnel_stages')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: true });
      
      setStages((data || []) as CRMFunnelStage[]);
    } catch (error) {
      console.error('Error loading stages:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      const startDate = getStartDate();
      const endDateValue = getEndDate();

      // Buscar conversas CRM com filtro de período e funil
      let conversationsQuery = supabase
        .from('whatsapp_conversations')
        .select('*')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', selectedFunnelId)
        .order('created_at', { ascending: false });
      
      // Filtrar por data de criação do lead no período
      if (startDate) {
        conversationsQuery = conversationsQuery.gte('created_at', startDate.toISOString());
      }
      
      // Aplicar data final
      if (endDateValue) {
        conversationsQuery = conversationsQuery.lte('created_at', endDateValue.toISOString());
      }

      const { data: conversations } = await conversationsQuery;
      const filteredConversations = conversations || [];

      // Contagens por estágio usando IDs do banco (UUIDs)
      const counts: Record<string, number> = {};
      stages.forEach(stage => {
        counts[stage.id] = 0;
      });

      let pipelineValue = 0;
      let unclassifiedCount = 0;
      
      filteredConversations.forEach(conv => {
        const stageId = conv.funnel_stage;
        if (stageId && counts[stageId] !== undefined) {
          counts[stageId]++;
        } else {
          unclassifiedCount++;
        }
        if (conv.estimated_value) {
          pipelineValue += Number(conv.estimated_value);
        }
      });

      // Mapear estágios com contagens
      const stageCountsData: StageCount[] = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        color: stage.color || '#6B7280',
        count: counts[stage.id] || 0,
        is_ai_controlled: stage.is_ai_controlled || false,
      }));

      // Adicionar não classificados se houver
      if (unclassifiedCount > 0) {
        stageCountsData.unshift({
          id: 'unclassified',
          name: 'Não Classificados',
          color: '#9CA3AF',
          count: unclassifiedCount,
          is_ai_controlled: false,
        });
      }

      // Encontrar estágio de handoff (pelo nome ou por is_ai_controlled = false após estágios de IA)
      const handoffStage = stages.find(s => 
        s.name.toLowerCase().includes('handoff') || 
        s.name.toLowerCase().includes('atendimento')
      );

      // Handoffs recentes
      const handoffs = handoffStage 
        ? filteredConversations
            .filter(c => c.funnel_stage === handoffStage.id)
            .slice(0, 5)
            .map(c => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              reason: c.ai_handoff_reason,
              time: c.last_message_at ? new Date(c.last_message_at).toLocaleString('pt-BR') : '',
            }))
        : [];

      // Mensagens no período selecionado
      let messagesQuery = supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true });
      
      if (startDate) {
        messagesQuery = messagesQuery.gte('created_at', startDate.toISOString());
      }
      if (endDateValue) {
        messagesQuery = messagesQuery.lte('created_at', endDateValue.toISOString());
      }
      
      const { count: periodMessagesCount } = await messagesQuery;

      // Broadcasts enviados (filtrado pelo período selecionado)
      let broadcastsQuery = supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');
      
      if (startDate) {
        broadcastsQuery = broadcastsQuery.gte('created_at', startDate.toISOString());
      }
      if (endDateValue) {
        broadcastsQuery = broadcastsQuery.lte('created_at', endDateValue.toISOString());
      }
      
      const { count: broadcastsSentCount } = await broadcastsQuery;

      // Respostas da IA no período
      let aiLogsQuery = supabase
        .from('whatsapp_ai_logs')
        .select('*', { count: 'exact', head: true });
      
      if (startDate) {
        aiLogsQuery = aiLogsQuery.gte('created_at', startDate.toISOString());
      }
      if (endDateValue) {
        aiLogsQuery = aiLogsQuery.lte('created_at', endDateValue.toISOString());
      }
      
      const { count: aiResponsesCount } = await aiLogsQuery;

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
        todayMessages: periodMessagesCount || 0,
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

  // Taxa de avanço: leads que saíram do primeiro estágio
  const advancementRate = useMemo(() => {
    if (stageCounts.length === 0) return 0;
    // Pegar o primeiro estágio real (não o "Não Classificados")
    const firstStage = stageCounts.find(s => s.id !== 'unclassified');
    const firstStageCount = firstStage?.count || 0;
    const total = metrics.totalLeads;
    if (total === 0) return 0;
    return Math.round(((total - firstStageCount) / total) * 100);
  }, [stageCounts, metrics.totalLeads]);

  // Taxa de conversão geral (Primeiro estágio → Último estágio)
  const overallConversionRate = useMemo(() => {
    if (stageCounts.length === 0) return 0;
    const realStages = stageCounts.filter(s => s.id !== 'unclassified');
    if (realStages.length < 2) return 0;
    const firstStageCount = realStages[0]?.count || 0;
    const lastStageCount = realStages[realStages.length - 1]?.count || 0;
    if (firstStageCount === 0) return 0;
    return Math.round((lastStageCount / firstStageCount) * 100);
  }, [stageCounts]);

  // Maior contagem para escala do funil
  const maxCount = useMemo(() => {
    return Math.max(...stageCounts.map(s => s.count), 1);
  }, [stageCounts]);

  // Format display for date range
  const getDateRangeDisplay = () => {
    if (!dateRange.from) return "Selecione período";
    if (!dateRange.to || dateRange.from.getTime() === dateRange.to.getTime()) {
      return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return `${format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (funnels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Nenhum funil CRM encontrado</p>
        <p className="text-sm text-muted-foreground">Crie um funil na página de Funis para começar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Pipeline de leads do CRM</p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {/* Seletor de Funil */}
            {funnels.length > 1 && (
              <Select value={selectedFunnelId || ''} onValueChange={setSelectedFunnelId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Selecione o funil" />
                </SelectTrigger>
                <SelectContent>
                  {funnels.map(funnel => (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      {funnel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {/* Unified Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "min-w-[200px] justify-start text-left font-normal",
                    !dateRange.from && "text-muted-foreground"
                  )}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  {getDateRangeDisplay()}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex">
                  {/* Presets */}
                  <div className="flex flex-col border-r p-2 gap-1 min-w-[120px]">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => applyPreset('today')}
                    >
                      Hoje
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => applyPreset('yesterday')}
                    >
                      Ontem
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => applyPreset('7days')}
                    >
                      Últimos 7 dias
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => applyPreset('30days')}
                    >
                      Últimos 30 dias
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="justify-start"
                      onClick={() => applyPreset('all')}
                    >
                      Todo período
                    </Button>
                  </div>
                  
                  {/* Calendar */}
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onDayClick={(day) => {
                      // Detectar duplo-clique no mesmo dia
                      const now = Date.now();
                      const isSameDay = lastClickedDayRef.current && 
                        day.getFullYear() === lastClickedDayRef.current.getFullYear() &&
                        day.getMonth() === lastClickedDayRef.current.getMonth() &&
                        day.getDate() === lastClickedDayRef.current.getDate();
                      
                      if (isSameDay && (now - lastClickTsRef.current) < 500) {
                        // Duplo-clique detectado - forçar dia único
                        setDateRange({ from: day, to: day });
                        ignoreNextSelectRef.current = true;
                        lastClickedDayRef.current = null;
                        lastClickTsRef.current = 0;
                      } else {
                        // Primeiro clique - guardar referência
                        lastClickedDayRef.current = day;
                        lastClickTsRef.current = now;
                      }
                    }}
                    onSelect={(range) => {
                      // Se acabamos de tratar um duplo-clique, ignorar este onSelect
                      if (ignoreNextSelectRef.current) {
                        ignoreNextSelectRef.current = false;
                        return;
                      }
                      
                      // Ignorar se range for undefined (navegação entre meses)
                      if (!range) return;
                      
                      // Se tem from e to, usar normalmente (seleção de intervalo completa)
                      if (range.from && range.to) {
                        setDateRange(range);
                        return;
                      }
                      
                      // Se só tem from - primeiro clique de um novo range
                      if (range.from && !range.to) {
                        setDateRange({ from: range.from, to: undefined });
                      }
                    }}
                    numberOfMonths={2}
                    disabled={(date) => date > new Date()}
                    locale={ptBR}
                    className="pointer-events-auto"
                  />
                </div>
                
                {/* Period indicator */}
                {dateRange.from && dateRange.to && (
                  <div className="border-t p-2 text-center">
                    <Badge variant="secondary">
                      {getPeriodDays()} dias selecionados
                    </Badge>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Sales Funnel Metrics - Disparos → Oportunidades → Fechamentos */}
      {selectedFunnelId && (
        <SalesFunnelMetrics 
          funnelId={selectedFunnelId}
          startDate={getStartDate()}
          endDate={getEndDate()}
        />
      )}

      {/* Funnel Velocity Card */}
      {selectedFunnelId && (
        <FunnelVelocity 
          funnelId={selectedFunnelId}
          pipelineValue={metrics.pipelineValue}
          conversionRate={overallConversionRate}
        />
      )}

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
            <p className="text-xs text-muted-foreground">Saíram do 1º estágio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversão Geral</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallConversionRate}%</div>
            <p className="text-xs text-muted-foreground">1º → Último estágio</p>
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
            <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.todayMessages}</div>
            <p className="text-xs text-muted-foreground">No período selecionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Respostas IA</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.aiResponses}</div>
            <p className="text-xs text-muted-foreground">No período selecionado</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolution Chart - Full Width */}
      {selectedFunnelId && (
        <FunnelEvolutionChart 
          funnelId={selectedFunnelId}
          startDate={getStartDate()}
          endDate={getEndDate()}
        />
      )}

      {/* Funil Visual + Comparativo */}
      <div className="grid gap-4 lg:grid-cols-7">
        {/* Funil Visual */}
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>
              Distribuição de leads por estágio - {funnels.find(f => f.id === selectedFunnelId)?.name || 'Funil'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4"></TableHead>
                  <TableHead className="w-40">Etapa</TableHead>
                  <TableHead>Distribuição</TableHead>
                  <TableHead className="text-center w-24">Tempo Médio</TableHead>
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
                              backgroundColor: stage.color 
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {stage.id !== 'unclassified' && selectedFunnelId && (
                          <StageTimeMetrics 
                            funnelId={selectedFunnelId}
                            stageId={stage.id}
                          />
                        )}
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

        {/* Comparativo de Período */}
        {selectedFunnelId && (
          <div className="lg:col-span-2">
            <PeriodComparison 
              funnelId={selectedFunnelId}
              startDate={getStartDate()}
              endDate={getEndDate()}
              periodDays={getPeriodDays()}
            />
          </div>
        )}
      </div>

      {/* Row 3: Alertas + Handoffs + AI Metrics */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Leads Críticos */}
        {selectedFunnelId && (
          <CriticalLeadsAlert 
            funnelId={selectedFunnelId}
            startDate={getStartDate()}
            endDate={getEndDate()}
          />
        )}

        {/* Handoffs Recentes */}
        <Card>
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

        {/* AI Metrics */}
        {selectedFunnelId && (
          <AIMetricsCard 
            funnelId={selectedFunnelId}
            startDate={getStartDate()}
            endDate={getEndDate()}
            periodDays={getPeriodDays()}
          />
        )}
      </div>

      {/* Row 4: Movimentações + Heatmap */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Feed de Movimentações do Funil */}
        <div className="lg:col-span-2">
          {selectedFunnelId && (
            <FunnelMovementFeed 
              funnelId={selectedFunnelId} 
              startDate={getStartDate()}
              endDate={getEndDate()}
            />
          )}
        </div>

        {/* Activity Heatmap */}
        {selectedFunnelId && (
          <ActivityHeatmap 
            funnelId={selectedFunnelId}
            startDate={getStartDate()}
            endDate={getEndDate()}
          />
        )}
      </div>

      {/* Monitor de Instâncias WhatsApp */}
      <InstanceMonitor 
        startDate={getStartDate()}
        endDate={getEndDate()}
      />
    </div>
  );
}

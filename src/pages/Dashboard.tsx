import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  Calendar
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import InstanceMonitor from "@/components/InstanceMonitor";

type DateFilter = 'today' | '7days' | '30days' | 'all';

interface DashboardStats {
  totalLeads: number;
  qualificationCount: number;
  presentationCount: number;
  interestCount: number;
  handoffCount: number;
  todayMessages: number;
  broadcastsSent: number;
  aiResponses: number;
}

interface StageData {
  name: string;
  count: number;
  color: string;
}

interface RecentHandoff {
  id: string;
  name: string | null;
  phone: string;
  reason: string | null;
  time: string;
}

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
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    qualificationCount: 0,
    presentationCount: 0,
    interestCount: 0,
    handoffCount: 0,
    todayMessages: 0,
    broadcastsSent: 0,
    aiResponses: 0,
  });
  const [stageData, setStageData] = useState<StageData[]>([]);
  const [recentHandoffs, setRecentHandoffs] = useState<RecentHandoff[]>([]);
  const [aiActive, setAiActive] = useState(false);
  const [loading, setLoading] = useState(true);

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

      // Buscar conversas com filtro de período
      let conversationsQuery = supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });
      
      if (startDate) {
        conversationsQuery = conversationsQuery.gte('created_at', startDate.toISOString());
      }

      const { data: conversations } = await conversationsQuery;
      const filteredConversations = conversations || [];

      // Mapear cores por stage_id
      const colorMap: Record<string, string> = {
        'new': '#6B7280',           // cinza
        'qualification': '#3B82F6', // azul
        'presentation': '#10B981',  // verde
        'interest': '#F59E0B',      // amarelo
        'handoff': '#EF4444',       // vermelho
      };

      // Contagens por estágio usando funnel_stage diretamente
      const stageCounts: Record<string, number> = {
        'new': 0,
        'qualification': 0,
        'presentation': 0,
        'interest': 0,
        'handoff': 0,
      };

      filteredConversations.forEach(conv => {
        const stage = conv.funnel_stage || 'new';
        if (stageCounts[stage] !== undefined) {
          stageCounts[stage]++;
        } else {
          stageCounts['new']++;
        }
      });

      // Dados para o gráfico do funil
      const stageLabels: Record<string, string> = {
        'new': 'Novo Lead',
        'qualification': 'Levantamento',
        'presentation': 'Apresentação',
        'interest': 'Interesse',
        'handoff': 'Handoff',
      };

      const stageOrder = ['new', 'qualification', 'presentation', 'interest', 'handoff'];
      const stageChartData = stageOrder.map(stageId => ({
        name: stageLabels[stageId],
        count: stageCounts[stageId] || 0,
        color: colorMap[stageId] || '#6B7280',
      }));

      // Handoffs recentes (usando funnel_stage)
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
        .single();

      setStats({
        totalLeads: filteredConversations.length,
        qualificationCount: stageCounts['qualification'] || 0,
        presentationCount: stageCounts['presentation'] || 0,
        interestCount: stageCounts['interest'] || 0,
        handoffCount: stageCounts['handoff'] || 0,
        todayMessages: todayMessagesCount || 0,
        broadcastsSent: broadcastsSentCount || 0,
        aiResponses: aiResponsesCount || 0,
      });

      setStageData(stageChartData);
      setRecentHandoffs(handoffs);
      setAiActive(aiConfig?.is_active || false);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const conversionRate = useMemo(() => {
    if (stats.totalLeads === 0) return 0;
    return Math.round(((stats.interestCount + stats.handoffCount) / stats.totalLeads) * 100);
  }, [stats]);

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
          <p className="text-muted-foreground">Visão geral do seu pipeline de leads</p>
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

      {/* Cards de Métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              Leads prospectados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Levantamento</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.qualificationCount}</div>
            <p className="text-xs text-muted-foreground">
              Leads em qualificação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Com Interesse</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.interestCount}</div>
            <p className="text-xs text-muted-foreground">
              Leads interessados
            </p>
          </CardContent>
        </Card>

        <Card className={stats.handoffCount > 0 ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Handoffs</CardTitle>
            <AlertCircle className={`h-4 w-4 ${stats.handoffCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.handoffCount}</div>
            <p className="text-xs text-muted-foreground">
              Aguardando atendimento
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Segunda linha de cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mensagens Hoje</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.todayMessages}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Broadcasts Enviados</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.broadcastsSent}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Respostas da IA</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.aiResponses}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lead → Interesse</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <Progress value={conversionRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Leads que avançaram para interesse ou handoff
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico e Handoffs */}
      <div className="grid gap-4 md:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>Distribuição de leads por estágio</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stageData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {stageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Handoffs Recentes
              {stats.handoffCount > 0 && (
                <Badge variant="destructive">{stats.handoffCount}</Badge>
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

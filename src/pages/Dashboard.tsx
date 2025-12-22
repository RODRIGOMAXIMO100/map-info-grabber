import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Users, 
  UserCheck, 
  MessageSquare, 
  AlertCircle, 
  TrendingUp,
  Send,
  Bot,
  Clock
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
import { CRM_STAGES } from "@/types/whatsapp";

interface DashboardStats {
  totalLeads: number;
  mqlCount: number;
  sqlCount: number;
  handoffCount: number;
  todayMessages: number;
  broadcastsSent: number;
  aiResponses: number;
  avgResponseTime: number;
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

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalLeads: 0,
    mqlCount: 0,
    sqlCount: 0,
    handoffCount: 0,
    todayMessages: 0,
    broadcastsSent: 0,
    aiResponses: 0,
    avgResponseTime: 0,
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
  }, []);

  const loadDashboardData = async () => {
    try {
      // Função para normalizar telefone (remover tudo exceto dígitos)
      const normalizePhone = (phone: string): string => {
        return phone.replace(/\D/g, '');
      };

      // Buscar telefones válidos (do broadcast)
      const { data: queuePhones } = await supabase.from('whatsapp_queue').select('phone');
      const { data: lists } = await supabase.from('broadcast_lists').select('lead_data, phones');
      
      // Criar Set de telefones NORMALIZADOS
      const broadcastPhones = new Set<string>();
      queuePhones?.forEach(q => broadcastPhones.add(normalizePhone(q.phone)));
      lists?.forEach(list => {
        const leadData = list.lead_data as Array<{ phone?: string }> | null;
        leadData?.forEach(lead => {
          if (lead.phone) broadcastPhones.add(normalizePhone(lead.phone));
        });
        list.phones?.forEach(phone => broadcastPhones.add(normalizePhone(phone)));
      });

      // Buscar conversas filtradas por broadcasts
      const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .order('last_message_at', { ascending: false });

      // Filtrar conversas comparando telefones NORMALIZADOS
      const filteredConversations = conversations?.filter(c => 
        broadcastPhones.has(normalizePhone(c.phone))
      ) || [];

      // Mapear cores de número para hex
      const colorMap: Record<number, string> = {
        1: '#6B7280', // cinza
        2: '#3B82F6', // azul
        3: '#10B981', // verde
        4: '#F59E0B', // amarelo
        5: '#EF4444', // vermelho
        6: '#8B5CF6', // roxo
        7: '#6B7280', // cinza
      };

      // Criar mapeamento de label_id para stage_id
      const labelToStageMap: Record<string, string> = {};
      CRM_STAGES.forEach(stage => {
        labelToStageMap[stage.label_id] = stage.id;
      });

      // Contagens por estágio usando tags (que contêm label_ids)
      const stageCounts: Record<string, number> = {};
      CRM_STAGES.forEach(stage => {
        stageCounts[stage.id] = 0;
      });

      filteredConversations.forEach(conv => {
        const tags = conv.tags || [];
        // Encontrar o estágio mais avançado baseado nas tags
        let matchedStageId: string | null = null;
        let highestOrder = 0;
        
        tags.forEach((tag: string) => {
          const stageId = labelToStageMap[tag];
          if (stageId) {
            const stage = CRM_STAGES.find(s => s.id === stageId);
            if (stage && stage.order > highestOrder) {
              highestOrder = stage.order;
              matchedStageId = stageId;
            }
          }
        });

        // Se não encontrou nenhum estágio via tags, conta como Lead Novo
        if (matchedStageId) {
          stageCounts[matchedStageId]++;
        } else {
          stageCounts['1']++; // Lead Novo
        }
      });

      // Identificar handoffs (estágio 5)
      const handoffStage = CRM_STAGES.find(s => s.name.includes('Handoff'));
      const handoffLabelId = handoffStage?.label_id || '21';

      const stageChartData = CRM_STAGES.map(stage => ({
        name: stage.name,
        count: stageCounts[stage.id] || 0,
        color: colorMap[stage.color] || '#6B7280',
      }));

      // Handoffs recentes (conversas de broadcast com tag de handoff)
      const handoffs = filteredConversations
        .filter(c => (c.tags || []).includes(handoffLabelId))
        .slice(0, 5)
        .map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          reason: c.ai_handoff_reason,
          time: c.last_message_at ? new Date(c.last_message_at).toLocaleString('pt-BR') : '',
        }));

      // Mensagens de hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: todayMessagesCount } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // Broadcasts enviados
      const { count: broadcastsSentCount } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent');

      // Respostas da IA
      const { count: aiResponsesCount } = await supabase
        .from('whatsapp_ai_logs')
        .select('*', { count: 'exact', head: true });

      // Status da IA
      const { data: aiConfig } = await supabase
        .from('whatsapp_ai_config')
        .select('is_active')
        .limit(1)
        .single();

      setStats({
        totalLeads: filteredConversations.length,
        mqlCount: stageCounts['2'] || 0, // MQL - Respondeu
        sqlCount: stageCounts['4'] || 0, // SQL - Qualificado
        handoffCount: stageCounts['5'] || 0, // Handoff - Vendedor
        todayMessages: todayMessagesCount || 0,
        broadcastsSent: broadcastsSentCount || 0,
        aiResponses: aiResponsesCount || 0,
        avgResponseTime: 0,
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
    return Math.round((stats.sqlCount / stats.totalLeads) * 100);
  }, [stats.totalLeads, stats.sqlCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do seu pipeline de leads</p>
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
            <CardTitle className="text-sm font-medium">MQL</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.mqlCount}</div>
            <p className="text-xs text-muted-foreground">
              Leads qualificados marketing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SQL</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sqlCount}</div>
            <p className="text-xs text-muted-foreground">
              Leads qualificados vendas
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
            <CardTitle className="text-sm font-medium">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conversionRate}%</div>
            <Progress value={conversionRate} className="mt-2" />
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

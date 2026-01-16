import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, subDays, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Users, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TeamMetricsTable,
  TopPerformersCards,
  PerformanceChart,
  VendorDetailSheet,
  DailyActivityCard,
  InactivityAlerts,
} from '@/components/team';
import { VendorMetrics } from '@/components/team/TeamMetricsTable';
import { DailyActivity } from '@/components/team/DailyActivityCard';

type PeriodType = '7d' | '30d' | '90d' | 'custom';

interface Funnel {
  id: string;
  name: string;
}

export default function TeamPerformance() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<VendorMetrics[]>([]);
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>('all');
  const [period, setPeriod] = useState<PeriodType>('30d');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedVendor, setSelectedVendor] = useState<VendorMetrics | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard');
      return;
    }
    loadFunnels();
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadMetrics();
    }
  }, [dateRange, selectedFunnel, isAdmin]);

  useEffect(() => {
    const now = new Date();
    switch (period) {
      case '7d':
        setDateRange({ from: subDays(now, 7), to: now });
        break;
      case '30d':
        setDateRange({ from: subDays(now, 30), to: now });
        break;
      case '90d':
        setDateRange({ from: subDays(now, 90), to: now });
        break;
      // 'custom' mantém o range atual
    }
  }, [period]);

  const loadFunnels = async () => {
    const { data } = await supabase
      .from('crm_funnels')
      .select('id, name')
      .order('name');
    setFunnels(data || []);
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const startDate = startOfDay(dateRange.from).toISOString();
      const endDate = endOfDay(dateRange.to).toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      // Buscar todos os vendedores (SDR e Closer)
      const { data: users } = await supabase
        .from('profiles')
        .select('user_id, full_name');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['sdr', 'closer']);

      const userRoleMap = new Map(roles?.map(r => [r.user_id, r.role]) || []);
      const vendorUsers = users?.filter(u => userRoleMap.has(u.user_id)) || [];

      if (vendorUsers.length === 0) {
        setMetrics([]);
        setLoading(false);
        return;
      }

      // Query base para conversas
      let conversationsQuery = supabase
        .from('whatsapp_conversations')
        .select('id, assigned_to, converted_at, closed_value, funnel_stage, last_message_at')
        .eq('is_crm_lead', true)
        .not('assigned_to', 'is', null);

      if (selectedFunnel !== 'all') {
        conversationsQuery = conversationsQuery.eq('crm_funnel_id', selectedFunnel);
      }

      const { data: conversations } = await conversationsQuery;

      // Query para mensagens enviadas no período
      const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('conversation_id, created_at, sent_by_user_id')
        .eq('direction', 'out')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      // Query para mensagens enviadas HOJE (para atividade diária)
      const { data: todayMessages } = await supabase
        .from('whatsapp_messages')
        .select('conversation_id, created_at, sent_by_user_id')
        .eq('direction', 'out')
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd);

      // Mapear conversation_id para assigned_to
      const conversationToAssigned = new Map(
        conversations?.map(c => [c.id, c.assigned_to]) || []
      );

      // Contar mensagens por vendedor
      const messagesByVendor: Record<string, number> = {};
      messages?.forEach(m => {
        // Se tem sent_by_user_id, usa ele; senão, usa assigned_to da conversa
        const userId = m.sent_by_user_id || conversationToAssigned.get(m.conversation_id);
        if (userId) {
          messagesByVendor[userId] = (messagesByVendor[userId] || 0) + 1;
        }
      });

      // Função para calcular tempo ativo baseado em sessões reais
      const calculateActiveTime = (messages: { created_at: string }[]): { 
        totalMinutes: number; 
        sessionsCount: number 
      } => {
        const GAP_THRESHOLD = 30; // minutos - gap maior que isso indica nova sessão
        
        if (messages.length === 0) return { totalMinutes: 0, sessionsCount: 0 };
        
        const sorted = [...messages].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        
        let totalMinutes = 0;
        let sessionsCount = 1;
        let sessionStart = sorted[0].created_at;
        let lastActivity = sessionStart;
        
        for (const msg of sorted.slice(1)) {
          const gap = differenceInMinutes(new Date(msg.created_at), new Date(lastActivity));
          
          if (gap > GAP_THRESHOLD) {
            // Fecha sessão anterior e inicia nova
            totalMinutes += differenceInMinutes(new Date(lastActivity), new Date(sessionStart));
            sessionStart = msg.created_at;
            sessionsCount++;
          }
          
          lastActivity = msg.created_at;
        }
        
        // Adiciona última sessão
        totalMinutes += differenceInMinutes(new Date(lastActivity), new Date(sessionStart));
        
        return { totalMinutes, sessionsCount };
      };

      // Agrupar mensagens de hoje por vendedor
      const todayMessagesByVendor: Record<string, { created_at: string }[]> = {};
      todayMessages?.forEach(m => {
        const userId = m.sent_by_user_id || conversationToAssigned.get(m.conversation_id);
        if (userId) {
          if (!todayMessagesByVendor[userId]) {
            todayMessagesByVendor[userId] = [];
          }
          todayMessagesByVendor[userId].push({ created_at: m.created_at });
        }
      });

      // Métricas de atividade HOJE
      const todayActivityByVendor: Record<string, { 
        count: number; 
        first: string | null; 
        last: string | null;
        conversationIds: Set<string>;
      }> = {};
      todayMessages?.forEach(m => {
        const userId = m.sent_by_user_id || conversationToAssigned.get(m.conversation_id);
        if (userId) {
          if (!todayActivityByVendor[userId]) {
            todayActivityByVendor[userId] = { count: 0, first: null, last: null, conversationIds: new Set() };
          }
          todayActivityByVendor[userId].count++;
          todayActivityByVendor[userId].conversationIds.add(m.conversation_id);
          const msgTime = m.created_at;
          if (!todayActivityByVendor[userId].first || msgTime < todayActivityByVendor[userId].first!) {
            todayActivityByVendor[userId].first = msgTime;
          }
          if (!todayActivityByVendor[userId].last || msgTime > todayActivityByVendor[userId].last!) {
            todayActivityByVendor[userId].last = msgTime;
          }
        }
      });

      // Query para movimentações no funil
      const { data: movements } = await supabase
        .from('funnel_stage_history')
        .select('changed_by')
        .gte('changed_at', startDate)
        .lte('changed_at', endDate)
        .not('changed_by', 'is', null);

      const movementsByVendor: Record<string, number> = {};
      movements?.forEach(m => {
        if (m.changed_by) {
          movementsByVendor[m.changed_by] = (movementsByVendor[m.changed_by] || 0) + 1;
        }
      });

      // Calcular leads sem contato há 24h+ por vendedor
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const leadsWithoutContactByVendor: Record<string, number> = {};
      conversations?.forEach(c => {
        if (c.assigned_to && !c.converted_at) {
          // Lead ativo sem conversão
          if (!c.last_message_at || c.last_message_at < twentyFourHoursAgo) {
            leadsWithoutContactByVendor[c.assigned_to] = (leadsWithoutContactByVendor[c.assigned_to] || 0) + 1;
          }
        }
      });

      // Calcular métricas por vendedor
      const vendorMetrics: VendorMetrics[] = vendorUsers.map(user => {
        const userConversations = conversations?.filter(c => c.assigned_to === user.user_id) || [];
        
        // Leads atribuídos (total)
        const leadsAssigned = userConversations.length;

        // Leads convertidos no período
        const convertedInPeriod = userConversations.filter(c => 
          c.converted_at && 
          new Date(c.converted_at) >= dateRange.from && 
          new Date(c.converted_at) <= dateRange.to
        );
        const leadsConverted = convertedInPeriod.length;

        // Leads ativos (não convertidos)
        const leadsActive = userConversations.filter(c => !c.converted_at).length;

        // Valor fechado no período
        const closedValue = convertedInPeriod.reduce((sum, c) => sum + (c.closed_value || 0), 0);

        // Taxa de conversão
        const conversionRate = leadsAssigned > 0 ? (leadsConverted / leadsAssigned) * 100 : 0;

        // Ticket médio
        const avgTicket = leadsConverted > 0 ? closedValue / leadsConverted : 0;

        // Atividade de hoje
        const todayActivity = todayActivityByVendor[user.user_id] || { 
          count: 0, first: null, last: null, conversationIds: new Set() 
        };
        
        // Calcular tempo ativo baseado em sessões reais
        const userTodayMessages = todayMessagesByVendor[user.user_id] || [];
        const { totalMinutes: activeTimeMinutes, sessionsCount } = calculateActiveTime(userTodayMessages);

        return {
          user_id: user.user_id,
          full_name: user.full_name,
          role: userRoleMap.get(user.user_id) || 'unknown',
          leads_assigned: leadsAssigned,
          leads_active: leadsActive,
          leads_converted: leadsConverted,
          conversion_rate: conversionRate,
          closed_value: closedValue,
          avg_ticket: avgTicket,
          messages_sent: messagesByVendor[user.user_id] || 0,
          funnel_movements: movementsByVendor[user.user_id] || 0,
          messages_today: todayActivity.count,
          first_activity_today: todayActivity.first,
          last_activity_today: todayActivity.last,
          leads_without_contact: leadsWithoutContactByVendor[user.user_id] || 0,
          conversations_today: todayActivity.conversationIds.size,
          active_time_minutes: activeTimeMinutes,
          sessions_count: sessionsCount,
        };
      });

      // Ordenar por mensagens hoje (atividade recente)
      vendorMetrics.sort((a, b) => b.messages_today - a.messages_today);
      setMetrics(vendorMetrics);
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVendorSelect = (vendor: VendorMetrics) => {
    setSelectedVendor(vendor);
    setDetailSheetOpen(true);
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Desempenho da Equipe
          </h1>
          <p className="text-muted-foreground">
            Acompanhe as métricas de cada vendedor
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Seletor de Período */}
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="90d">Últimos 90 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Picker para período customizado */}
          {period === 'custom' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.from, 'dd/MM/yy', { locale: ptBR })} - {format(dateRange.to, 'dd/MM/yy', { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to });
                    }
                  }}
                  locale={ptBR}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Seletor de Funil */}
          <Select value={selectedFunnel} onValueChange={setSelectedFunnel}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Funil" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Funis</SelectItem>
              {funnels.map(funnel => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={loadMetrics} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Top Performers */}
      <TopPerformersCards data={metrics} />

      {/* Cards de Atividade e Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyActivityCard 
          data={metrics.map(m => ({
            user_id: m.user_id,
            full_name: m.full_name,
            role: m.role,
            messages_today: m.messages_today,
            first_activity: m.first_activity_today,
            last_activity: m.last_activity_today,
            leads_without_contact: m.leads_without_contact,
          }))}
          loading={loading}
        />
        <InactivityAlerts
          inactiveUsers={metrics
            .filter(m => m.messages_today === 0)
            .map(m => ({
              user_id: m.user_id,
              full_name: m.full_name,
              last_activity: m.last_activity_today,
              leads_pending: m.leads_without_contact,
            }))}
          pendingLeads={[]}
          loading={loading}
        />
      </div>

      {/* Grid: Tabela + Gráfico */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Métricas por Vendedor</CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <TeamMetricsTable
                data={metrics}
                onSelectVendor={handleVendorSelect}
                loading={loading}
              />
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-1">
          <PerformanceChart data={metrics} />
        </div>
      </div>

      {/* Detail Sheet */}
      <VendorDetailSheet
        vendor={selectedVendor}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        startDate={dateRange.from}
        endDate={dateRange.to}
      />
    </div>
  );
}

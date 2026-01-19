import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInHours, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { CRMFunnelStage } from '@/types/crm';

// ============ TYPES ============
export interface StageCount {
  id: string;
  name: string;
  color: string;
  count: number;
  is_ai_controlled: boolean;
}

export interface HeroMetricsData {
  closedValue: { current: number; previous: number };
  pipelineLeads: { current: number; previous: number };
  conversionRate: { current: number; previous: number };
  avgCycleDays: { current: number; previous: number };
}

export interface AlertItem {
  id: string;
  name: string | null;
  phone: string;
  detail: string;
  priority: number;
  timestamp?: string;
}

export interface AlertsData {
  critical: AlertItem[];
  handoffs: AlertItem[];
  reminders: AlertItem[];
}

export interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  format: 'number' | 'currency' | 'percent';
}

export interface AIMetricsData {
  totalResponses: number;
  handoffCount: number;
  handoffRate: number;
  avgResponseChars: number;
  isActive: boolean;
  topIntents: { intent: string; count: number }[];
}

export interface DashboardData {
  stageCounts: StageCount[];
  heroMetrics: HeroMetricsData;
  alerts: AlertsData;
  periodComparison: ComparisonMetric[];
  aiMetrics: AIMetricsData;
  loading: boolean;
  error: Error | null;
}

interface UseDashboardDataProps {
  funnelId: string | null;
  stages: CRMFunnelStage[];
  startDate: Date | null;
  endDate: Date | null;
  periodDays: number;
}

// ============ HOOK ============
export function useDashboardData({
  funnelId,
  stages,
  startDate,
  endDate,
  periodDays,
}: UseDashboardDataProps): DashboardData & { refresh: () => void } {
  const [data, setData] = useState<DashboardData>({
    stageCounts: [],
    heroMetrics: {
      closedValue: { current: 0, previous: 0 },
      pipelineLeads: { current: 0, previous: 0 },
      conversionRate: { current: 0, previous: 0 },
      avgCycleDays: { current: 0, previous: 0 },
    },
    alerts: { critical: [], handoffs: [], reminders: [] },
    periodComparison: [],
    aiMetrics: {
      totalResponses: 0,
      handoffCount: 0,
      handoffRate: 0,
      avgResponseChars: 0,
      isActive: false,
      topIntents: [],
    },
    loading: true,
    error: null,
  });

  const loadAllData = useCallback(async () => {
    if (!funnelId || stages.length === 0) {
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setData(prev => ({ ...prev, loading: true, error: null }));

      const now = new Date();
      const currentStart = startDate?.toISOString();
      const currentEnd = endDate?.toISOString();

      // Calculate previous period
      const prevEnd = startDate ? new Date(startDate.getTime() - 1) : null;
      const prevStart = prevEnd 
        ? new Date(prevEnd.getTime() - (periodDays * 24 * 60 * 60 * 1000)) 
        : null;

      // ============ PARALLEL QUERIES ============
      const [
        // 1. All conversations for current period (main data source)
        currentConversationsResult,
        // 2. All conversations for previous period
        previousConversationsResult,
        // 3. Won stage (last stage in funnel)
        wonStageResult,
        // 4. Handoff stage
        handoffStageResult,
        // 5. AI logs for current period (count only)
        currentAILogsResult,
        // 6. AI logs for previous period (count only)
        previousAILogsResult,
        // 7. AI config status
        aiConfigResult,
        // 8. AI logs with details for metrics
        aiLogsDetailResult,
      ] = await Promise.all([
        // 1. Current period conversations
        supabase
          .from('whatsapp_conversations')
          .select(`
            id, name, phone, funnel_stage, created_at, converted_at,
            estimated_value, closed_value, ai_paused, ai_handoff_reason,
            last_lead_message_at, last_message_at, funnel_stage_changed_at,
            reminder_at
          `)
          .eq('is_crm_lead', true)
          .eq('crm_funnel_id', funnelId)
          .gte('created_at', currentStart || '2020-01-01')
          .lte('created_at', currentEnd || now.toISOString()),

        // 2. Previous period conversations
        prevStart && prevEnd
          ? supabase
              .from('whatsapp_conversations')
              .select('id, estimated_value, converted_at, created_at, funnel_stage, closed_value')
              .eq('is_crm_lead', true)
              .eq('crm_funnel_id', funnelId)
              .gte('created_at', prevStart.toISOString())
              .lte('created_at', prevEnd.toISOString())
          : Promise.resolve({ data: [] }),

        // 3. Won stage (last stage)
        supabase
          .from('crm_funnel_stages')
          .select('id')
          .eq('funnel_id', funnelId)
          .order('stage_order', { ascending: false })
          .limit(1),

        // 4. Handoff stage
        supabase
          .from('crm_funnel_stages')
          .select('id')
          .eq('funnel_id', funnelId)
          .or('name.ilike.%handoff%,name.ilike.%atendimento%')
          .limit(1)
          .maybeSingle(),

        // 5. Current AI logs count
        supabase
          .from('whatsapp_ai_logs')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', currentStart || '2020-01-01')
          .lte('created_at', currentEnd || now.toISOString()),

        // 6. Previous AI logs count
        prevStart && prevEnd
          ? supabase
              .from('whatsapp_ai_logs')
              .select('*', { count: 'exact', head: true })
              .gte('created_at', prevStart.toISOString())
              .lte('created_at', prevEnd.toISOString())
          : Promise.resolve({ count: 0 }),

        // 7. AI config
        supabase
          .from('whatsapp_ai_config')
          .select('is_active')
          .limit(1)
          .maybeSingle(),

        // 8. AI logs with details (for intent analysis)
        supabase
          .from('whatsapp_ai_logs')
          .select('ai_response, detected_intent, needs_human')
          .gte('created_at', currentStart || '2020-01-01')
          .lte('created_at', currentEnd || now.toISOString())
          .limit(500),
      ]);

      const currentLeads = currentConversationsResult.data || [];
      const prevLeads = (previousConversationsResult as any).data || [];
      const wonStageId = wonStageResult.data?.[0]?.id;
      const handoffStageId = handoffStageResult.data?.id;
      const aiLogs = aiLogsDetailResult.data || [];

      // ============ PROCESS STAGE COUNTS ============
      const stageCounts: Record<string, number> = {};
      stages.forEach(stage => { stageCounts[stage.id] = 0; });
      
      let unclassifiedCount = 0;
      currentLeads.forEach(conv => {
        const stageId = conv.funnel_stage;
        if (stageId && stageCounts[stageId] !== undefined) {
          stageCounts[stageId]++;
        } else {
          unclassifiedCount++;
        }
      });

      const stageCountsData: StageCount[] = stages.map(stage => ({
        id: stage.id,
        name: stage.name,
        color: stage.color || '#6B7280',
        count: stageCounts[stage.id] || 0,
        is_ai_controlled: stage.is_ai_controlled || false,
      }));

      if (unclassifiedCount > 0) {
        stageCountsData.unshift({
          id: 'unclassified',
          name: 'Não Classificados',
          color: '#9CA3AF',
          count: unclassifiedCount,
          is_ai_controlled: false,
        });
      }

      // ============ PROCESS HERO METRICS ============
      const currentClosedValue = currentLeads
        .filter(l => l.funnel_stage === wonStageId)
        .reduce((sum, l) => sum + (Number(l.closed_value) || Number(l.estimated_value) || 0), 0);
      
      const currentPipelineLeads = currentLeads.length;
      const currentWonCount = currentLeads.filter(l => l.funnel_stage === wonStageId).length;
      const currentConversionRate = currentPipelineLeads > 0 
        ? Math.round((currentWonCount / currentPipelineLeads) * 100) 
        : 0;
      
      const currentConvertedLeads = currentLeads.filter(l => l.converted_at);
      const currentAvgCycle = currentConvertedLeads.length > 0
        ? Math.round(currentConvertedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at!);
            const converted = new Date(l.converted_at!);
            return sum + (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / currentConvertedLeads.length)
        : 0;

      // Previous period metrics
      const prevClosedValue = prevLeads
        .filter((l: any) => l.funnel_stage === wonStageId)
        .reduce((sum: number, l: any) => sum + (Number(l.closed_value) || Number(l.estimated_value) || 0), 0);
      
      const prevPipelineLeads = prevLeads.length;
      const prevWonCount = prevLeads.filter((l: any) => l.funnel_stage === wonStageId).length;
      const prevConversionRate = prevPipelineLeads > 0 
        ? Math.round((prevWonCount / prevPipelineLeads) * 100) 
        : 0;

      const prevConvertedLeads = prevLeads.filter((l: any) => l.converted_at);
      const prevAvgCycle = prevConvertedLeads.length > 0
        ? Math.round(prevConvertedLeads.reduce((sum: number, l: any) => {
            const created = new Date(l.created_at!);
            const converted = new Date(l.converted_at!);
            return sum + (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / prevConvertedLeads.length)
        : 0;

      // ============ PROCESS ALERTS ============
      const criticalAlerts: AlertItem[] = [];
      const coldThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      const stalledThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      currentLeads.forEach(lead => {
        // Cold leads (no response > 48h)
        if (lead.last_lead_message_at && new Date(lead.last_lead_message_at) < coldThreshold) {
          const hours = differenceInHours(now, new Date(lead.last_lead_message_at));
          criticalAlerts.push({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            detail: `❄️ Sem resposta há ${Math.floor(hours / 24)}d ${hours % 24}h`,
            priority: 1,
          });
        }

        // High value stalled
        if (
          Number(lead.estimated_value) > 1000 && 
          lead.funnel_stage_changed_at && 
          new Date(lead.funnel_stage_changed_at) < stalledThreshold
        ) {
          const days = Math.floor(differenceInHours(now, new Date(lead.funnel_stage_changed_at)) / 24);
          criticalAlerts.push({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            detail: `💰 R$ ${Number(lead.estimated_value).toLocaleString('pt-BR')} parado há ${days}d`,
            priority: 2,
          });
        }

        // AI paused
        if (lead.ai_paused) {
          criticalAlerts.push({
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            detail: `🤖 ${lead.ai_handoff_reason || 'IA pausada'}`,
            priority: 3,
          });
        }
      });

      // Handoff alerts
      const handoffAlerts: AlertItem[] = currentLeads
        .filter(lead => 
          (handoffStageId && lead.funnel_stage === handoffStageId) || 
          (!handoffStageId && lead.ai_paused)
        )
        .slice(0, 10)
        .map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          detail: lead.ai_handoff_reason || 'Aguardando atendimento',
          priority: 1,
          timestamp: lead.last_message_at || undefined,
        }));

      // Reminder alerts
      const reminderAlerts: AlertItem[] = currentLeads
        .filter(lead => lead.reminder_at && new Date(lead.reminder_at) < now)
        .slice(0, 10)
        .map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          detail: `Vencido ${formatDistanceToNow(new Date(lead.reminder_at!), { addSuffix: true, locale: ptBR })}`,
          priority: 1,
          timestamp: lead.reminder_at || undefined,
        }));

      // Deduplicate critical
      const uniqueCritical = criticalAlerts
        .filter((alert, index, self) => self.findIndex(a => a.id === alert.id) === index)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 10);

      // ============ PROCESS AI METRICS ============
      const totalResponses = aiLogs.length;
      const handoffs = aiLogs.filter(l => l.needs_human).length;
      const handoffRate = totalResponses > 0 ? Math.round((handoffs / totalResponses) * 100) : 0;

      const responseLengths = aiLogs
        .filter(l => l.ai_response)
        .map(l => l.ai_response!.length);
      const avgResponseChars = responseLengths.length > 0 
        ? Math.round(responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length)
        : 0;

      const intentCounts: Record<string, number> = {};
      aiLogs.forEach(log => {
        if (log.detected_intent) {
          intentCounts[log.detected_intent] = (intentCounts[log.detected_intent] || 0) + 1;
        }
      });
      const topIntents = Object.entries(intentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([intent, count]) => ({ intent, count }));

      // ============ PROCESS PERIOD COMPARISON ============
      const currentConversions = currentLeads.filter(c => c.converted_at).length;
      const previousConversions = prevLeads.filter((c: any) => c.converted_at).length;
      const currentValue = currentLeads.reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);
      const previousValue = prevLeads.reduce((sum: number, c: any) => sum + (Number(c.estimated_value) || 0), 0);

      const periodComparison: ComparisonMetric[] = [
        { label: 'Novos Leads', current: currentPipelineLeads, previous: prevPipelineLeads, format: 'number' },
        { label: 'Conversões', current: currentConversions, previous: previousConversions, format: 'number' },
        { label: 'Valor Pipeline', current: currentValue, previous: previousValue, format: 'currency' },
        { label: 'Respostas IA', current: currentAILogsResult.count || 0, previous: (previousAILogsResult as any).count || 0, format: 'number' },
      ];

      // ============ SET ALL DATA ============
      setData({
        stageCounts: stageCountsData,
        heroMetrics: {
          closedValue: { current: currentClosedValue, previous: prevClosedValue },
          pipelineLeads: { current: currentPipelineLeads, previous: prevPipelineLeads },
          conversionRate: { current: currentConversionRate, previous: prevConversionRate },
          avgCycleDays: { current: currentAvgCycle, previous: prevAvgCycle },
        },
        alerts: {
          critical: uniqueCritical,
          handoffs: handoffAlerts,
          reminders: reminderAlerts,
        },
        periodComparison,
        aiMetrics: {
          totalResponses,
          handoffCount: handoffs,
          handoffRate,
          avgResponseChars,
          isActive: aiConfigResult.data?.is_active || false,
          topIntents,
        },
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setData(prev => ({ ...prev, loading: false, error: error as Error }));
    }
  }, [funnelId, stages, startDate, endDate, periodDays]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return { ...data, refresh: loadAllData };
}

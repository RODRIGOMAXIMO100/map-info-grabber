import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Minus
} from "lucide-react";

interface HeroMetricsProps {
  funnelId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  periodDays: number;
}

interface MetricData {
  current: number;
  previous: number;
  format: 'currency' | 'number' | 'percent' | 'days';
}

export default function HeroMetrics({ funnelId, startDate, endDate, periodDays }: HeroMetricsProps) {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    closedValue: { current: 0, previous: 0, format: 'currency' as const },
    pipelineLeads: { current: 0, previous: 0, format: 'number' as const },
    conversionRate: { current: 0, previous: 0, format: 'percent' as const },
    avgCycleDays: { current: 0, previous: 0, format: 'days' as const },
  });

  useEffect(() => {
    loadMetrics();
  }, [funnelId, startDate, endDate]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      
      // Calculate date ranges
      const currentStart = startDate?.toISOString();
      const currentEnd = endDate?.toISOString();
      
      // Previous period (same duration, before current period)
      const prevEnd = startDate ? new Date(startDate.getTime() - 1) : null;
      const prevStart = prevEnd ? new Date(prevEnd.getTime() - (periodDays * 24 * 60 * 60 * 1000)) : null;

      // Get funnel stages to find the "won" stage
      const { data: stages } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, stage_order')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: false })
        .limit(1);
      
      const wonStageId = stages?.[0]?.id;

      // --- CURRENT PERIOD ---
      let currentQuery = supabase
        .from('whatsapp_conversations')
        .select('id, estimated_value, converted_at, created_at, funnel_stage, closed_value')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId);
      
      if (currentStart) currentQuery = currentQuery.gte('created_at', currentStart);
      if (currentEnd) currentQuery = currentQuery.lte('created_at', currentEnd);
      
      const { data: currentLeads } = await currentQuery;

      // --- PREVIOUS PERIOD ---
      let prevQuery = supabase
        .from('whatsapp_conversations')
        .select('id, estimated_value, converted_at, created_at, funnel_stage, closed_value')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId);
      
      if (prevStart) prevQuery = prevQuery.gte('created_at', prevStart.toISOString());
      if (prevEnd) prevQuery = prevQuery.lte('created_at', prevEnd.toISOString());
      
      const { data: prevLeads } = await prevQuery;

      // Calculate metrics for current period
      const currentClosedValue = (currentLeads || [])
        .filter(l => l.funnel_stage === wonStageId)
        .reduce((sum, l) => sum + (Number(l.closed_value) || Number(l.estimated_value) || 0), 0);
      
      const currentPipelineLeads = currentLeads?.length || 0;
      
      const currentWonCount = (currentLeads || []).filter(l => l.funnel_stage === wonStageId).length;
      const currentConversionRate = currentPipelineLeads > 0 
        ? Math.round((currentWonCount / currentPipelineLeads) * 100) 
        : 0;
      
      // Calculate average cycle time (days from created_at to converted_at)
      const currentConvertedLeads = (currentLeads || []).filter(l => l.converted_at);
      const currentAvgCycle = currentConvertedLeads.length > 0
        ? Math.round(currentConvertedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at!);
            const converted = new Date(l.converted_at!);
            return sum + (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / currentConvertedLeads.length)
        : 0;

      // Calculate metrics for previous period
      const prevClosedValue = (prevLeads || [])
        .filter(l => l.funnel_stage === wonStageId)
        .reduce((sum, l) => sum + (Number(l.closed_value) || Number(l.estimated_value) || 0), 0);
      
      const prevPipelineLeads = prevLeads?.length || 0;
      
      const prevWonCount = (prevLeads || []).filter(l => l.funnel_stage === wonStageId).length;
      const prevConversionRate = prevPipelineLeads > 0 
        ? Math.round((prevWonCount / prevPipelineLeads) * 100) 
        : 0;

      const prevConvertedLeads = (prevLeads || []).filter(l => l.converted_at);
      const prevAvgCycle = prevConvertedLeads.length > 0
        ? Math.round(prevConvertedLeads.reduce((sum, l) => {
            const created = new Date(l.created_at!);
            const converted = new Date(l.converted_at!);
            return sum + (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / prevConvertedLeads.length)
        : 0;

      setMetrics({
        closedValue: { current: currentClosedValue, previous: prevClosedValue, format: 'currency' },
        pipelineLeads: { current: currentPipelineLeads, previous: prevPipelineLeads, format: 'number' },
        conversionRate: { current: currentConversionRate, previous: prevConversionRate, format: 'percent' },
        avgCycleDays: { current: currentAvgCycle, previous: prevAvgCycle, format: 'days' },
      });
    } catch (error) {
      console.error('Error loading hero metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: number, format: MetricData['format']) => {
    switch (format) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percent':
        return `${value}%`;
      case 'days':
        return `${value}d`;
      default:
        return value.toLocaleString('pt-BR');
    }
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const getChangeDisplay = (change: number, isInverse: boolean = false) => {
    // For cycle days, lower is better (inverse)
    const isPositive = isInverse ? change < 0 : change > 0;
    const isNegative = isInverse ? change > 0 : change < 0;
    
    if (change === 0) {
      return {
        icon: <Minus className="h-3 w-3" />,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
    }
    
    return {
      icon: isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />,
      color: isPositive ? 'text-green-600' : 'text-red-600',
      bgColor: isPositive ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950',
    };
  };

  const heroCards = [
    {
      title: 'Valor Fechado',
      icon: DollarSign,
      metric: metrics.closedValue,
      iconColor: 'text-green-600',
      iconBg: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Leads no Pipeline',
      icon: Users,
      metric: metrics.pipelineLeads,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900',
    },
    {
      title: 'Taxa de Conversão',
      icon: TrendingUp,
      metric: metrics.conversionRate,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-100 dark:bg-purple-900',
    },
    {
      title: 'Ciclo Médio',
      icon: Clock,
      metric: metrics.avgCycleDays,
      iconColor: 'text-orange-600',
      iconBg: 'bg-orange-100 dark:bg-orange-900',
      isInverse: true, // Lower is better
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {heroCards.map((card) => {
        const change = calculateChange(card.metric.current, card.metric.previous);
        const changeDisplay = getChangeDisplay(change, card.isInverse);
        const Icon = card.icon;

        return (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-3xl font-bold tracking-tight">
                    {formatValue(card.metric.current, card.metric.format)}
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg ${card.iconBg}`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={`${changeDisplay.bgColor} ${changeDisplay.color} border-0 gap-1`}
                >
                  {changeDisplay.icon}
                  {Math.abs(change)}%
                </Badge>
                <span className="text-xs text-muted-foreground">
                  vs período anterior
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

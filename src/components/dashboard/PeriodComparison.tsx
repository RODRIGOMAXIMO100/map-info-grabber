import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, GitCompare } from "lucide-react";

interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  format: 'number' | 'currency' | 'percent';
}

interface PeriodComparisonProps {
  funnelId: string;
  periodDays: number;
}

export default function PeriodComparison({ funnelId, periodDays }: PeriodComparisonProps) {
  const [metrics, setMetrics] = useState<ComparisonMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadComparison();
  }, [funnelId, periodDays]);

  const loadComparison = async () => {
    try {
      setLoading(true);
      
      const now = new Date();
      const currentStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const previousStart = new Date(currentStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

      // Current period
      const { data: currentData } = await supabase
        .from('whatsapp_conversations')
        .select('id, estimated_value, converted_at, created_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .gte('created_at', currentStart.toISOString());

      // Previous period
      const { data: previousData } = await supabase
        .from('whatsapp_conversations')
        .select('id, estimated_value, converted_at, created_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', currentStart.toISOString());

      // Calculate metrics
      const currentLeads = currentData?.length || 0;
      const previousLeads = previousData?.length || 0;

      const currentValue = (currentData || []).reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);
      const previousValue = (previousData || []).reduce((sum, c) => sum + (Number(c.estimated_value) || 0), 0);

      const currentConversions = (currentData || []).filter(c => c.converted_at).length;
      const previousConversions = (previousData || []).filter(c => c.converted_at).length;

      // AI responses current period
      const { count: currentAI } = await supabase
        .from('whatsapp_ai_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', currentStart.toISOString());

      const { count: previousAI } = await supabase
        .from('whatsapp_ai_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', previousStart.toISOString())
        .lt('created_at', currentStart.toISOString());

      setMetrics([
        { label: 'Novos Leads', current: currentLeads, previous: previousLeads, format: 'number' },
        { label: 'Conversões', current: currentConversions, previous: previousConversions, format: 'number' },
        { label: 'Valor Pipeline', current: currentValue, previous: previousValue, format: 'currency' },
        { label: 'Respostas IA', current: currentAI || 0, previous: previousAI || 0, format: 'number' },
      ]);
    } catch (error) {
      console.error('Error loading comparison:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const formatValue = (value: number, format: 'number' | 'currency' | 'percent'): string => {
    switch (format) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percent':
        return `${value}%`;
      default:
        return value.toString();
    }
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4" />;
    if (change < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-green-600 bg-green-50 border-green-200';
    if (change < 0) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-muted-foreground bg-muted border-border';
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-5 w-5" />
            Comparativo
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
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-5 w-5" />
          Comparativo de Período
        </CardTitle>
        <CardDescription className="text-xs">
          vs. {periodDays} dias anteriores
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {metrics.map((metric) => {
            const change = calculateChange(metric.current, metric.previous);
            
            return (
              <div key={metric.label} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-lg font-bold">{formatValue(metric.current, metric.format)}</p>
                </div>
                <Badge 
                  variant="outline" 
                  className={`flex items-center gap-1 ${getChangeColor(change)}`}
                >
                  {getChangeIcon(change)}
                  {change > 0 ? '+' : ''}{change}%
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

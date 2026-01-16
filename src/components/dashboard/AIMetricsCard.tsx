import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, MessageSquare, AlertCircle, Zap } from "lucide-react";

interface AIMetrics {
  totalResponses: number;
  handoffCount: number;
  handoffRate: number;
  avgResponseChars: number;
  isActive: boolean;
  topIntents: { intent: string; count: number }[];
}

interface AIMetricsCardProps {
  funnelId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  periodDays: number;
}

export default function AIMetricsCard({ funnelId, startDate, endDate, periodDays }: AIMetricsCardProps) {
  const [metrics, setMetrics] = useState<AIMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAIMetrics();
  }, [funnelId, startDate, endDate, periodDays]);

  const loadAIMetrics = async () => {
    try {
      setLoading(true);
      
      // Use provided dates or calculate from periodDays
      const queryEndDate = endDate || new Date();
      const queryStartDate = startDate || new Date(queryEndDate.getTime() - periodDays * 24 * 60 * 60 * 1000);

      // Get conversations from this funnel
      const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId);

      const conversationIds = (conversations || []).map(c => c.id);

      if (conversationIds.length === 0) {
        setMetrics({
          totalResponses: 0,
          handoffCount: 0,
          handoffRate: 0,
          avgResponseChars: 0,
          isActive: false,
          topIntents: []
        });
        setLoading(false);
        return;
      }

      // AI logs for this period
      let aiLogsQuery = supabase
        .from('whatsapp_ai_logs')
        .select('ai_response, detected_intent, needs_human')
        .in('conversation_id', conversationIds)
        .gte('created_at', queryStartDate.toISOString());

      if (endDate) {
        aiLogsQuery = aiLogsQuery.lte('created_at', endDate.toISOString());
      }

      const { data: aiLogs } = await aiLogsQuery;

      const logs = aiLogs || [];
      const totalResponses = logs.length;
      const handoffs = logs.filter(l => l.needs_human).length;
      const handoffRate = totalResponses > 0 ? Math.round((handoffs / totalResponses) * 100) : 0;

      // Average response length
      const responseLengths = logs
        .filter(l => l.ai_response)
        .map(l => l.ai_response!.length);
      const avgResponseChars = responseLengths.length > 0 
        ? Math.round(responseLengths.reduce((a, b) => a + b, 0) / responseLengths.length)
        : 0;

      // Top intents
      const intentCounts: Record<string, number> = {};
      logs.forEach(log => {
        if (log.detected_intent) {
          intentCounts[log.detected_intent] = (intentCounts[log.detected_intent] || 0) + 1;
        }
      });
      const topIntents = Object.entries(intentCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([intent, count]) => ({ intent, count }));

      // AI active status
      const { data: aiConfig } = await supabase
        .from('whatsapp_ai_config')
        .select('is_active')
        .limit(1)
        .maybeSingle();

      setMetrics({
        totalResponses,
        handoffCount: handoffs,
        handoffRate,
        avgResponseChars,
        isActive: aiConfig?.is_active || false,
        topIntents
      });
    } catch (error) {
      console.error('Error loading AI metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" />
            Performance IA
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

  if (!metrics) return null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5" />
          Performance IA
          <div className="ml-auto flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${metrics.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`} />
            <span className="text-xs font-normal text-muted-foreground">
              {metrics.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </CardTitle>
        <CardDescription className="text-xs">
          Período selecionado
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Main stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <MessageSquare className="h-3 w-3" />
              Respostas
            </div>
            <p className="text-xl font-bold">{metrics.totalResponses}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <AlertCircle className="h-3 w-3" />
              Handoffs
            </div>
            <p className="text-xl font-bold">{metrics.handoffCount}</p>
          </div>
        </div>

        {/* Handoff rate */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Taxa de Handoff</span>
            <span className="font-medium">{metrics.handoffRate}%</span>
          </div>
          <Progress 
            value={metrics.handoffRate} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {metrics.handoffRate < 20 ? '✓ Ótimo' : metrics.handoffRate < 40 ? '⚠ Moderado' : '⚠ Alto'}
          </p>
        </div>

        {/* Avg response */}
        <div className="flex items-center justify-between p-2 rounded-lg border">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Média caracteres</span>
          </div>
          <span className="font-medium text-sm">{metrics.avgResponseChars}</span>
        </div>

        {/* Top intents */}
        {metrics.topIntents.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Intenções mais detectadas</p>
            <div className="flex flex-wrap gap-1">
              {metrics.topIntents.map(({ intent, count }) => (
                <Badge key={intent} variant="secondary" className="text-xs">
                  {intent} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

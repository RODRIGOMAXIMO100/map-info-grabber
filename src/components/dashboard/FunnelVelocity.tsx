import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Gauge, TrendingUp } from "lucide-react";

interface FunnelVelocityProps {
  funnelId: string;
  pipelineValue: number;
  conversionRate: number;
}

export default function FunnelVelocity({ funnelId, pipelineValue, conversionRate }: FunnelVelocityProps) {
  const [avgCycleDays, setAvgCycleDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateVelocity();
  }, [funnelId]);

  const calculateVelocity = async () => {
    try {
      setLoading(true);

      // Get converted leads from this funnel
      const { data: convertedLeads } = await supabase
        .from('whatsapp_conversations')
        .select('created_at, converted_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .not('converted_at', 'is', null)
        .limit(50);

      if (convertedLeads && convertedLeads.length > 0) {
        const cycleTimes = convertedLeads.map(lead => {
          const created = new Date(lead.created_at!);
          const converted = new Date(lead.converted_at!);
          return (converted.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
        });
        
        const avgDays = Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length);
        setAvgCycleDays(Math.max(avgDays, 1));
      }
    } catch (error) {
      console.error('Error calculating velocity:', error);
    } finally {
      setLoading(false);
    }
  };

  // Funnel velocity formula: (Pipeline Value × Conversion Rate) / Avg Cycle Time
  const weeklyVelocity = avgCycleDays > 0 
    ? (pipelineValue * (conversionRate / 100)) / (avgCycleDays / 7)
    : 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Gauge className="h-5 w-5 text-muted-foreground" />
            <div className="animate-pulse bg-muted h-6 w-32 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Velocidade do Funil</p>
              <p className="text-xl font-bold text-primary">
                {weeklyVelocity.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                <span className="text-sm font-normal text-muted-foreground">/semana</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Ciclo médio
            </div>
            <p className="font-medium">{avgCycleDays} dias</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

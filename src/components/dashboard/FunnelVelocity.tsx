import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Gauge, TrendingUp, DollarSign } from "lucide-react";

interface FunnelVelocityProps {
  funnelId: string;
  pipelineValue: number;
  conversionRate: number;
}

export default function FunnelVelocity({ funnelId, pipelineValue, conversionRate }: FunnelVelocityProps) {
  const [avgCycleDays, setAvgCycleDays] = useState<number>(7);
  const [wonValue, setWonValue] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateVelocity();
  }, [funnelId]);

  const calculateVelocity = async () => {
    try {
      setLoading(true);

      // Buscar estágios do funil para identificar o de ganho
      const { data: stagesData } = await supabase
        .from('crm_funnel_stages')
        .select('id, name, stage_order')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: false });

      // Identificar estágio de ganho: "FECHADO" ou maior ordem exceto "PERDIDO"
      const wonStage = stagesData?.find(s => 
        s.name.toLowerCase().includes('fechado') || 
        s.name.toLowerCase().includes('ganho') ||
        s.name.toLowerCase().includes('won')
      ) || stagesData?.find(s => 
        !s.name.toLowerCase().includes('perdido') && 
        !s.name.toLowerCase().includes('lost')
      );

      if (!wonStage) {
        setLoading(false);
        return;
      }

      // Buscar leads no estágio de ganho
      const { data: wonLeads } = await supabase
        .from('whatsapp_conversations')
        .select('id, created_at, funnel_stage_changed_at, estimated_value, closed_value')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .eq('funnel_stage', wonStage.id)
        .limit(100);

      if (wonLeads && wonLeads.length > 0) {
        // Calcular tempo médio de ciclo
        const cycleTimes = wonLeads
          .filter(lead => lead.funnel_stage_changed_at && lead.created_at)
          .map(lead => {
            const created = new Date(lead.created_at!);
            const closed = new Date(lead.funnel_stage_changed_at!);
            return (closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
          });
        
        if (cycleTimes.length > 0) {
          const avgDays = Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length);
          setAvgCycleDays(Math.max(avgDays, 1));
        }

        // Calcular valor total ganho (priorizar closed_value)
        const totalWon = wonLeads.reduce((sum, lead) => 
          sum + (Number((lead as { closed_value?: number }).closed_value) || Number(lead.estimated_value) || 0), 0
        );
        setWonValue(totalWon);
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
          
          {/* Valor Ganho */}
          <div className="text-center px-4 border-x border-border/50">
            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Total Ganho
            </div>
            <p className="font-bold text-green-600">
              {wonValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
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

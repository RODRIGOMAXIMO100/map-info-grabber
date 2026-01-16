import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Target, DollarSign, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SalesFunnelMetricsProps {
  funnelId: string;
  startDate: Date | null;
  endDate: Date | null;
}

interface FunnelMetrics {
  disparos: number;
  oportunidades: number;
  fechamentos: number;
  valorFechado: number;
}

export default function SalesFunnelMetrics({ funnelId, startDate, endDate }: SalesFunnelMetricsProps) {
  const [metrics, setMetrics] = useState<FunnelMetrics>({
    disparos: 0,
    oportunidades: 0,
    fechamentos: 0,
    valorFechado: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (startDate && endDate) {
      loadMetrics();
    }
  }, [funnelId, startDate?.getTime(), endDate?.getTime()]);

  const loadMetrics = async () => {
    if (!startDate || !endDate) return;
    
    try {
      setLoading(true);
      const start = startDate.toISOString();
      const end = endDate.toISOString();

      console.log('[SalesFunnelMetrics] Query range:', { start, end, funnelId });

      // 1. Disparos (broadcasts enviados no período)
      const { count: disparosCount } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('created_at', start)
        .lte('created_at', end);

      // 2. Oportunidades (leads que entraram no estágio "CALL DE VENDA/OPORTUNIDADE" - stage_order 3)
      // Primeiro, buscar o ID do estágio de oportunidade
      const { data: opportunityStage } = await supabase
        .from('crm_funnel_stages')
        .select('id')
        .eq('funnel_id', funnelId)
        .eq('stage_order', 3)
        .single();
      
      const opportunityStageId = opportunityStage?.id;
      
      let oportunidadesCount = 0;
      if (opportunityStageId) {
        const { count } = await supabase
          .from('funnel_stage_history')
          .select('*', { count: 'exact', head: true })
          .eq('to_stage_id', opportunityStageId)
          .gte('changed_at', start)
          .lte('changed_at', end);
        
        oportunidadesCount = count || 0;
      }

      // 3. Fechamentos (leads que foram para o estágio FECHADO no período)
      // Primeiro, buscar o ID do estágio "FECHADO" ou similar
      const { data: stages } = await supabase
        .from('crm_funnel_stages')
        .select('id, name')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: false })
        .limit(1);
      
      const closedStageId = stages?.[0]?.id;
      
      let fechamentosCount = 0;
      let valorFechado = 0;

      if (closedStageId) {
        const { data: closedLeads } = await supabase
          .from('whatsapp_conversations')
          .select('id, closed_value')
          .eq('is_crm_lead', true)
          .eq('crm_funnel_id', funnelId)
          .eq('funnel_stage', closedStageId)
          .gte('funnel_stage_changed_at', start)
          .lte('funnel_stage_changed_at', end);
        
        fechamentosCount = closedLeads?.length || 0;
        valorFechado = closedLeads?.reduce((sum, lead) => sum + (lead.closed_value || 0), 0) || 0;
      }

      setMetrics({
        disparos: disparosCount || 0,
        oportunidades: oportunidadesCount || 0,
        fechamentos: fechamentosCount,
        valorFechado,
      });
    } catch (error) {
      console.error('Error loading sales funnel metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calcular taxas
  const taxaResposta = metrics.disparos > 0 
    ? ((metrics.oportunidades / metrics.disparos) * 100).toFixed(1) 
    : '0';
  
  const taxaFechamento = metrics.oportunidades > 0 
    ? ((metrics.fechamentos / metrics.oportunidades) * 100).toFixed(1) 
    : '0';

  // Determinar o maior valor para escala
  const maxValue = Math.max(metrics.disparos, metrics.oportunidades, metrics.fechamentos, 1);

  const getBarWidth = (value: number) => {
    return Math.max((value / maxValue) * 100, value > 0 ? 10 : 0);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Funil de Vendas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Funil de Vendas
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Funil Visual */}
        <div className="flex items-center justify-between gap-2 mb-6">
          {/* Disparos */}
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Send className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{metrics.disparos.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-muted-foreground">Disparos</div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${getBarWidth(metrics.disparos)}%` }}
              />
            </div>
          </div>

          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />

          {/* Oportunidades */}
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="p-3 rounded-full bg-green-500/10">
                <Target className="h-6 w-6 text-green-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{metrics.oportunidades.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-muted-foreground">Oportunidades</div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${getBarWidth(metrics.oportunidades)}%` }}
              />
            </div>
          </div>

          <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />

          {/* Fechamentos */}
          <div className="flex-1 text-center">
            <div className="flex items-center justify-center mb-2">
              <div className="p-3 rounded-full bg-amber-500/10">
                <DollarSign className="h-6 w-6 text-amber-500" />
              </div>
            </div>
            <div className="text-2xl font-bold">{metrics.fechamentos.toLocaleString('pt-BR')}</div>
            <div className="text-sm text-muted-foreground">Fechamentos</div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${getBarWidth(metrics.fechamentos)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Valor Total Fechado */}
        {metrics.valorFechado > 0 && (
          <div className="text-center py-3 mb-4 bg-amber-500/10 rounded-lg">
            <div className="text-sm text-muted-foreground">Valor Total Fechado</div>
            <div className="text-xl font-bold text-amber-600">
              {metrics.valorFechado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
          </div>
        )}

        {/* Taxas de Conversão */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Taxa de Resposta</div>
            <Badge 
              variant="outline" 
              className={cn(
                "text-lg font-bold px-3 py-1",
                parseFloat(taxaResposta) > 0 ? "border-green-500 text-green-600" : "border-muted"
              )}
            >
              {taxaResposta}%
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">
              Oportunidades / Disparos
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-1">Taxa de Fechamento</div>
            <Badge 
              variant="outline" 
              className={cn(
                "text-lg font-bold px-3 py-1",
                parseFloat(taxaFechamento) > 0 ? "border-amber-500 text-amber-600" : "border-muted"
              )}
            >
              {taxaFechamento}%
            </Badge>
            <div className="text-xs text-muted-foreground mt-1">
              Fechamentos / Oportunidades
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

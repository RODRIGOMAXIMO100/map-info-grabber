import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { VendorMetrics } from './TeamMetricsTable';
import { TrendingUp, Users, DollarSign, MessageSquare, Calendar, ArrowRight } from 'lucide-react';

interface VendorDetailSheetProps {
  vendor: VendorMetrics | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: Date;
  endDate: Date;
}

interface RecentConversion {
  id: string;
  name: string | null;
  phone: string;
  converted_at: string;
  closed_value: number | null;
}

interface StageDistribution {
  stage_name: string;
  count: number;
  color: string | null;
}

export default function VendorDetailSheet({
  vendor,
  open,
  onOpenChange,
  startDate,
  endDate,
}: VendorDetailSheetProps) {
  const [recentConversions, setRecentConversions] = useState<RecentConversion[]>([]);
  const [stageDistribution, setStageDistribution] = useState<StageDistribution[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (vendor && open) {
      loadVendorDetails();
    }
  }, [vendor, open]);

  const loadVendorDetails = async () => {
    if (!vendor) return;
    setLoading(true);

    try {
      // Conversões recentes
      const { data: conversions } = await supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, converted_at, closed_value')
        .eq('assigned_to', vendor.user_id)
        .eq('is_crm_lead', true)
        .not('converted_at', 'is', null)
        .gte('converted_at', startDate.toISOString())
        .lte('converted_at', endDate.toISOString())
        .order('converted_at', { ascending: false })
        .limit(10);

      setRecentConversions(conversions || []);

      // Distribuição por estágio
      const { data: leads } = await supabase
        .from('whatsapp_conversations')
        .select('funnel_stage')
        .eq('assigned_to', vendor.user_id)
        .eq('is_crm_lead', true)
        .is('converted_at', null);

      if (leads && leads.length > 0) {
        // Buscar nomes dos estágios
        const stageIds = [...new Set(leads.map(l => l.funnel_stage).filter(Boolean))];
        const { data: stages } = await supabase
          .from('crm_funnel_stages')
          .select('id, name, color')
          .in('id', stageIds);

        const stageMap = new Map(stages?.map(s => [s.id, { name: s.name, color: s.color }]) || []);
        
        const distribution: Record<string, { count: number; color: string | null }> = {};
        leads.forEach(lead => {
          if (lead.funnel_stage) {
            const stageInfo = stageMap.get(lead.funnel_stage);
            const stageName = stageInfo?.name || 'Sem Estágio';
            if (!distribution[stageName]) {
              distribution[stageName] = { count: 0, color: stageInfo?.color || null };
            }
            distribution[stageName].count++;
          }
        });

        setStageDistribution(
          Object.entries(distribution)
            .map(([stage_name, { count, color }]) => ({ stage_name, count, color }))
            .sort((a, b) => b.count - a.count)
        );
      }
    } catch (error) {
      console.error('Error loading vendor details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'sdr':
        return <Badge className="bg-blue-500 hover:bg-blue-600">SDR</Badge>;
      case 'closer':
        return <Badge className="bg-green-500 hover:bg-green-600">Closer</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };

  if (!vendor) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {vendor.full_name}
            {getRoleBadge(vendor.role)}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-100px)] pr-4 mt-6">
          <div className="space-y-6">
            {/* Métricas Principais */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    <span className="text-xs">Leads</span>
                  </div>
                  <p className="text-2xl font-bold">{vendor.leads_assigned}</p>
                  <p className="text-xs text-muted-foreground">{vendor.leads_active} ativos</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs">Conversões</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{vendor.leads_converted}</p>
                  <p className="text-xs text-muted-foreground">{vendor.conversion_rate.toFixed(1)}% taxa</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs">Valor Fechado</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(vendor.closed_value)}</p>
                  <p className="text-xs text-muted-foreground">Ticket: {formatCurrency(vendor.avg_ticket)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs">Atividade</span>
                  </div>
                  <p className="text-2xl font-bold">{vendor.messages_sent}</p>
                  <p className="text-xs text-muted-foreground">mensagens enviadas</p>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Distribuição por Estágio */}
            {stageDistribution.length > 0 && (
              <div>
                <h3 className="text-sm font-medium mb-3">Leads por Estágio</h3>
                <div className="space-y-2">
                  {stageDistribution.map((stage) => (
                    <div key={stage.stage_name} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: stage.color || 'hsl(var(--muted-foreground))' }}
                        />
                        <span className="text-sm">{stage.stage_name}</span>
                      </div>
                      <Badge variant="secondary">{stage.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Conversões Recentes */}
            <div>
              <h3 className="text-sm font-medium mb-3">Conversões Recentes</h3>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : recentConversions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conversão no período.</p>
              ) : (
                <div className="space-y-2">
                  {recentConversions.map((conv) => (
                    <div key={conv.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{conv.name || conv.phone}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(conv.converted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-green-600">
                          {conv.closed_value ? formatCurrency(conv.closed_value) : '-'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

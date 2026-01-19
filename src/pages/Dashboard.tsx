import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeSubscription";
import { useDashboardData } from "@/hooks/useDashboardData";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, differenceInDays, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

import { 
  Users, 
  UserCheck, 
  CalendarRange,
  Bot,
  BarChart3,
  Settings2,
  RefreshCw,
} from "lucide-react";
import { 
  InstanceMonitor,
  FunnelEvolutionChart,
  ActivityHeatmap,
  FunnelMovementFeed,
} from '@/components/lazy';
import { 
  PeriodComparison,
  AIMetricsCard,
  SalesFunnelMetrics,
  HeroMetrics,
  ActionAlerts
} from '@/components/dashboard';
import type { CRMFunnel, CRMFunnelStage } from "@/types/crm";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>('30days');
  const [funnelsLoading, setFunnelsLoading] = useState(true);
  const [funnels, setFunnels] = useState<CRMFunnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [stages, setStages] = useState<CRMFunnelStage[]>([]);
  const [activeTab, setActiveTab] = useState<'vendas' | 'tecnico'>('vendas');

  // Helper functions for date handling
  const getStartDate = (): Date | null => {
    if (dateRange.from) {
      return startOfDay(dateRange.from);
    }
    return null;
  };

  const getEndDate = (): Date | null => {
    if (dateRange.to) {
      return endOfDay(dateRange.to);
    }
    if (dateRange.from) {
      return endOfDay(dateRange.from);
    }
    return null;
  };

  const getPeriodDays = (): number => {
    if (dateRange.from && dateRange.to) {
      return Math.max(1, differenceInDays(dateRange.to, dateRange.from) + 1);
    }
    return 30;
  };

  // Centralized dashboard data hook
  const dashboardData = useDashboardData({
    funnelId: selectedFunnelId,
    stages,
    startDate: getStartDate(),
    endDate: getEndDate(),
    periodDays: getPeriodDays(),
  });

  // Apply preset date ranges
  const applyPreset = (preset: string) => {
    const now = new Date();
    const today = startOfDay(now);
    
    let newRange: DateRange;
    
    switch (preset) {
      case 'today':
        newRange = { from: today, to: now };
        break;
      case 'yesterday':
        const yesterday = subDays(today, 1);
        newRange = { from: yesterday, to: yesterday };
        break;
      case '7days':
        newRange = { from: subDays(now, 7), to: now };
        break;
      case '30days':
        newRange = { from: subDays(now, 30), to: now };
        break;
      case 'all':
        newRange = { from: new Date(2020, 0, 1), to: now };
        break;
      default:
        return;
    }
    
    setActivePreset(preset);
    setDateRange(newRange);
    setIsDatePickerOpen(false);
  };

  // Load funnels on init
  useEffect(() => {
    loadFunnels();
  }, []);

  // Load stages when funnel selected
  useEffect(() => {
    if (selectedFunnelId) {
      loadStages(selectedFunnelId);
    }
  }, [selectedFunnelId]);

  // Centralized realtime subscription
  useRealtimeRefresh(
    'whatsapp_conversations',
    useCallback(() => {
      if (stages.length > 0 && selectedFunnelId) {
        dashboardData.refresh();
      }
    }, [stages, selectedFunnelId, dashboardData.refresh]),
    { enabled: stages.length > 0 && !!selectedFunnelId }
  );

  const loadFunnels = async () => {
    try {
      const { data } = await supabase
        .from('crm_funnels')
        .select('*')
        .order('is_default', { ascending: false });
      
      if (data && data.length > 0) {
        setFunnels(data as CRMFunnel[]);
        const defaultFunnel = data.find(f => f.is_default) || data[0];
        setSelectedFunnelId(defaultFunnel.id);
      }
      setFunnelsLoading(false);
    } catch (error) {
      console.error('Error loading funnels:', error);
      setFunnelsLoading(false);
    }
  };

  const loadStages = async (funnelId: string) => {
    try {
      const { data } = await supabase
        .from('crm_funnel_stages')
        .select('*')
        .eq('funnel_id', funnelId)
        .order('stage_order', { ascending: true });
      
      setStages((data || []) as CRMFunnelStage[]);
    } catch (error) {
      console.error('Error loading stages:', error);
    }
  };

  const handleRefresh = () => {
    dashboardData.refresh();
  };

  // Max count for funnel scale
  const maxCount = useMemo(() => {
    return Math.max(...dashboardData.stageCounts.map(s => s.count), 1);
  }, [dashboardData.stageCounts]);

  // Format display for date range
  const getDateRangeDisplay = () => {
    if (!dateRange.from) return "Selecione período";
    if (!dateRange.to || dateRange.from.getTime() === dateRange.to.getTime()) {
      return format(dateRange.from, "dd/MM/yyyy", { locale: ptBR });
    }
    return `${format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} - ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`;
  };

  if (funnelsLoading || dashboardData.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (funnels.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Nenhum funil CRM encontrado</p>
        <p className="text-sm text-muted-foreground">Crie um funil na página de Funis para começar</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Quick Actions */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              {funnels.find(f => f.id === selectedFunnelId)?.name || 'Pipeline de vendas'}
            </p>
          </div>
          
          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters Row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Funnel Selector */}
          {funnels.length > 1 && (
            <Select value={selectedFunnelId || ''} onValueChange={setSelectedFunnelId}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels.map(funnel => (
                  <SelectItem key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* Date Range Picker */}
          <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "min-w-[200px] justify-start text-left font-normal",
                  !dateRange.from && "text-muted-foreground"
                )}
              >
                <CalendarRange className="mr-2 h-4 w-4" />
                {getDateRangeDisplay()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex">
                {/* Presets */}
                <div className="flex flex-col border-r p-2 gap-1 min-w-[120px]">
                  <Button 
                    variant={activePreset === 'today' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="justify-start"
                    onClick={() => applyPreset('today')}
                  >
                    Hoje
                  </Button>
                  <Button 
                    variant={activePreset === 'yesterday' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="justify-start"
                    onClick={() => applyPreset('yesterday')}
                  >
                    Ontem
                  </Button>
                  <Button 
                    variant={activePreset === '7days' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="justify-start"
                    onClick={() => applyPreset('7days')}
                  >
                    Últimos 7 dias
                  </Button>
                  <Button 
                    variant={activePreset === '30days' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="justify-start"
                    onClick={() => applyPreset('30days')}
                  >
                    Últimos 30 dias
                  </Button>
                  <Button 
                    variant={activePreset === 'all' ? 'secondary' : 'ghost'} 
                    size="sm" 
                    className="justify-start"
                    onClick={() => applyPreset('all')}
                  >
                    Todo período
                  </Button>
                </div>
                
                {/* Calendar */}
                <CalendarComponent
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    if (!range) return;
                    setActivePreset(null);
                    setDateRange(range);
                    if (range.from && range.to) {
                      setIsDatePickerOpen(false);
                    }
                  }}
                  numberOfMonths={2}
                  disabled={(date) => date > new Date()}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
              </div>
              
              {/* Footer */}
              <div className="border-t p-2 flex justify-between items-center">
                {dateRange.from && dateRange.to && (
                  <Badge variant="secondary">
                    {getPeriodDays()} dias selecionados
                  </Badge>
                )}
                <div className="flex gap-2 ml-auto">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setIsDatePickerOpen(false)}
                  >
                    Fechar
                  </Button>
                  {dateRange.from && !dateRange.to && (
                    <Button 
                      size="sm"
                      onClick={() => {
                        if (dateRange.from) {
                          setDateRange({ from: dateRange.from, to: dateRange.from });
                          setIsDatePickerOpen(false);
                        }
                      }}
                    >
                      Usar dia único
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Tabs: Vendas vs Técnico */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'vendas' | 'tecnico')}>
        <TabsList>
          <TabsTrigger value="vendas" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Vendas
          </TabsTrigger>
          <TabsTrigger value="tecnico" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Técnico
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB: VENDAS ============ */}
        <TabsContent value="vendas" className="space-y-6 mt-6">
          
          {/* HERO SECTION - Key Metrics */}
          {selectedFunnelId && (
            <HeroMetrics 
              data={dashboardData.heroMetrics}
              loading={dashboardData.loading}
            />
          )}

          {/* Main Grid: Funnel + Alerts */}
          <div className="grid gap-6 lg:grid-cols-3">
            
            {/* Funnel Visual - 2 columns */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Funil de Conversão</CardTitle>
                <CardDescription>
                  Distribuição atual de leads por estágio
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 pl-4"></TableHead>
                      <TableHead className="w-36">Etapa</TableHead>
                      <TableHead>Distribuição</TableHead>
                      <TableHead className="text-right w-20 pr-4">Leads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboardData.stageCounts.map((stage) => {
                      const widthPercentage = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
                      const isAI = stage.is_ai_controlled;
                      
                      return (
                        <TableRow 
                          key={stage.id} 
                          className="hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate(`/crm?stage=${stage.id}`)}
                        >
                          <TableCell className="pl-4">
                            {isAI ? (
                              <Bot className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{stage.name}</TableCell>
                          <TableCell>
                            <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all duration-300"
                                style={{ 
                                  width: `${Math.max(widthPercentage, stage.count > 0 ? 8 : 0)}%`,
                                  backgroundColor: stage.color 
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold pr-4">{stage.count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {/* Legend */}
                <div className="flex items-center justify-center gap-6 py-3 border-t text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Bot className="h-3.5 w-3.5" />
                    <span>IA</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Manual</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Alerts - 1 column */}
            {selectedFunnelId && (
              <ActionAlerts 
                data={dashboardData.alerts}
                loading={dashboardData.loading}
              />
            )}
          </div>

          {/* Activity Section */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Movement Feed - 2 columns */}
            <div className="lg:col-span-2">
              {selectedFunnelId && (
                <FunnelMovementFeed 
                  funnelId={selectedFunnelId} 
                  startDate={getStartDate()}
                  endDate={getEndDate()}
                />
              )}
            </div>

            {/* Period Comparison - 1 column */}
            {selectedFunnelId && (
              <PeriodComparison 
                data={dashboardData.periodComparison}
                periodDays={getPeriodDays()}
                loading={dashboardData.loading}
              />
            )}
          </div>

          {/* Sales Funnel Metrics */}
          {selectedFunnelId && (
            <SalesFunnelMetrics 
              funnelId={selectedFunnelId}
              startDate={getStartDate()}
              endDate={getEndDate()}
            />
          )}
        </TabsContent>

        {/* ============ TAB: TÉCNICO ============ */}
        <TabsContent value="tecnico" className="space-y-6 mt-6">
          
          {/* Instance Monitor */}
          <InstanceMonitor 
            startDate={getStartDate()}
            endDate={getEndDate()}
          />

          {/* AI + Heatmap + Evolution */}
          <div className="grid gap-6 lg:grid-cols-2">
            {selectedFunnelId && (
              <AIMetricsCard 
                data={dashboardData.aiMetrics}
                loading={dashboardData.loading}
              />
            )}

            {selectedFunnelId && (
              <ActivityHeatmap 
                funnelId={selectedFunnelId}
                startDate={getStartDate()}
                endDate={getEndDate()}
              />
            )}
          </div>

          {/* Evolution Chart */}
          {selectedFunnelId && (
            <FunnelEvolutionChart 
              funnelId={selectedFunnelId}
              startDate={getStartDate()}
              endDate={getEndDate()}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

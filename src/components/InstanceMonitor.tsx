import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMultiRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Smartphone, 
  Send, 
  AlertCircle, 
  Clock,
  CheckCircle,
  XCircle,
  Activity
} from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";

interface InstanceStats {
  id: string;
  name: string;
  phone: string;
  color: string;
  isActive: boolean;
  sentToday: number;
  failedToday: number;
  pending: number;
  successRate: number;
}

interface HourlyData {
  hour: string;
  [key: string]: number | string;
}

interface RecentLog {
  id: string;
  phone: string;
  status: string;
  sent_at: string;
  instanceName: string;
  instanceColor: string;
}

interface InstanceMonitorProps {
  startDate?: Date;
  endDate?: Date;
  compact?: boolean;
}

export default function InstanceMonitor({ startDate, endDate, compact = false }: InstanceMonitorProps) {
  const [instanceStats, setInstanceStats] = useState<InstanceStats[]>([]);
  const [pieData, setPieData] = useState<{ name: string; value: number; color: string }[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMonitorData = async () => {
    try {
      // Buscar configurações ativas
      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('*')
        .order('created_at', { ascending: true });

      if (!configs || configs.length === 0) {
        setLoading(false);
        return;
      }

      // Usar período selecionado ou padrão para hoje
      const queryStartDate = startDate || (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
      })();
      const queryEndDate = endDate || new Date();

      // Buscar logs do período
      let logsQuery = supabase
        .from('whatsapp_logs')
        .select('*')
        .gte('sent_at', queryStartDate.toISOString())
        .lte('sent_at', queryEndDate.toISOString())
        .order('sent_at', { ascending: false });

      const { data: logsInPeriod } = await logsQuery;

      // Buscar mensagens pendentes na fila por config_id
      const { data: pendingQueue } = await supabase
        .from('whatsapp_queue')
        .select('config_id')
        .eq('status', 'pending');

      // Processar estatísticas por instância
      const stats: InstanceStats[] = configs.map(config => {
        const configLogs = logsInPeriod?.filter(log => log.config_id === config.id) || [];
        const sentCount = configLogs.filter(log => log.status === 'sent').length;
        const failedCount = configLogs.filter(log => log.status === 'failed').length;
        const pendingCount = pendingQueue?.filter(q => q.config_id === config.id).length || 0;
        const total = sentCount + failedCount;
        const successRate = total > 0 ? Math.round((sentCount / total) * 100) : 100;

        return {
          id: config.id,
          name: config.name || 'Instância',
          phone: config.instance_phone || 'N/A',
          color: config.color || '#10B981',
          isActive: config.is_active || false,
          sentToday: sentCount,
          failedToday: failedCount,
          pending: pendingCount,
          successRate
        };
      });

      setInstanceStats(stats);

      // Dados para gráfico de pizza
      const totalSent = stats.reduce((acc, s) => acc + s.sentToday, 0);
      const pieChartData = stats
        .filter(s => s.sentToday > 0)
        .map(s => ({
          name: s.name,
          value: s.sentToday,
          color: s.color
        }));

      setPieData(pieChartData.length > 0 ? pieChartData : [{ name: 'Sem envios', value: 1, color: '#6B7280' }]);

      // Dados por hora
      const hourlyStats: Record<string, Record<string, number>> = {};
      for (let h = 0; h < 24; h++) {
        const hourKey = h.toString().padStart(2, '0');
        hourlyStats[hourKey] = {};
        configs.forEach(config => {
          hourlyStats[hourKey][config.id] = 0;
        });
      }

      logsInPeriod?.forEach(log => {
        if (log.sent_at && log.config_id && log.status === 'sent') {
          const hour = new Date(log.sent_at).getHours().toString().padStart(2, '0');
          if (hourlyStats[hour] && log.config_id in hourlyStats[hour]) {
            hourlyStats[hour][log.config_id]++;
          }
        }
      });

      const hourlyChartData: HourlyData[] = Object.entries(hourlyStats).map(([hour, data]) => {
        const item: HourlyData = { hour: `${hour}h` };
        configs.forEach(config => {
          item[config.name || config.id] = data[config.id] || 0;
        });
        return item;
      });

      setHourlyData(hourlyChartData);

      // Logs recentes (últimos 10)
      const configMap = new Map(configs.map(c => [c.id, { name: c.name, color: c.color }]));
      const recent: RecentLog[] = (logsInPeriod || []).slice(0, 10).map(log => {
        const configInfo = log.config_id ? configMap.get(log.config_id) : null;
        return {
          id: log.id,
          phone: log.phone,
          status: log.status,
          sent_at: log.sent_at,
          instanceName: configInfo?.name || 'Desconhecido',
          instanceColor: configInfo?.color || '#6B7280'
        };
      });

      setRecentLogs(recent);

    } catch (error) {
      console.error('Error loading monitor data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRealtimeRefresh = useCallback(() => {
    loadMonitorData();
  }, [startDate, endDate]);

  // Centralized realtime subscription for logs and queue
  useMultiRealtimeSubscription([
    { table: 'whatsapp_logs', callback: handleRealtimeRefresh },
    { table: 'whatsapp_queue', callback: handleRealtimeRefresh },
  ]);

  useEffect(() => {
    loadMonitorData();

    // Atualizar a cada 30 segundos
    const interval = setInterval(loadMonitorData, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [startDate, endDate]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (instanceStats.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <Smartphone className="h-8 w-8 mb-2" />
          <p>Nenhuma instância WhatsApp configurada</p>
        </CardContent>
      </Card>
    );
  }

  const totalSentToday = instanceStats.reduce((acc, s) => acc + s.sentToday, 0);
  const totalFailedToday = instanceStats.reduce((acc, s) => acc + s.failedToday, 0);
  const totalPending = instanceStats.reduce((acc, s) => acc + s.pending, 0);

  return (
    <div className="space-y-4">
      {/* Compact Summary Bar */}
      <Card className="p-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="font-medium">{totalSentToday}</span>
              <span className="text-muted-foreground">enviadas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="font-medium">{totalFailedToday}</span>
              <span className="text-muted-foreground">falhas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{totalPending}</span>
              <span className="text-muted-foreground">pendentes</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Taxa de sucesso: <span className="font-medium text-foreground">{totalSentToday + totalFailedToday > 0 ? Math.round((totalSentToday / (totalSentToday + totalFailedToday)) * 100) : 100}%</span>
          </div>
        </div>
      </Card>

      {/* Cards de Instâncias - only show if not compact */}
      {!compact && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {instanceStats.map((instance) => (
            <Card key={instance.id} className="relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 w-1 h-full" 
                style={{ backgroundColor: instance.color }}
              />
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Smartphone className="h-3.5 w-3.5" />
                    {instance.name}
                  </CardTitle>
                  <Badge variant={instance.isActive ? "default" : "secondary"} className="text-xs px-1.5 py-0">
                    {instance.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {instance.phone}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 px-3 pb-3">
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-base font-bold text-green-600">{instance.sentToday}</div>
                    <div className="text-[10px] text-muted-foreground">Enviadas</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-destructive">{instance.failedToday}</div>
                    <div className="text-[10px] text-muted-foreground">Falhas</div>
                  </div>
                  <div>
                    <div className="text-base font-bold text-muted-foreground">{instance.pending}</div>
                    <div className="text-[10px] text-muted-foreground">Pendentes</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Taxa de sucesso</span>
                    <span>{instance.successRate}%</span>
                  </div>
                  <Progress value={instance.successRate} className="h-1.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Gráficos */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Gráfico de Pizza */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Distribuição de Envios</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={compact ? 150 : 180}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={compact ? 35 : 45}
                  outerRadius={compact ? 55 : 70}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Gráfico de Barras por Hora */}
        <Card className="p-3">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Envios por Hora</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ResponsiveContainer width="100%" height={compact ? 150 : 180}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={compact ? 3 : 1} />
                <YAxis tick={{ fontSize: 9 }} width={25} />
                <Tooltip />
                {!compact && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                {instanceStats.map((instance) => (
                  <Bar 
                    key={instance.id}
                    dataKey={instance.name}
                    fill={instance.color}
                    stackId="a"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Últimos Envios */}
      <Card className="p-3">
        <CardHeader className="p-0 pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" />
            Últimos Envios
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
              <Send className="h-6 w-6 mb-1" />
              <p className="text-sm">Nenhum envio no período</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs py-2">Telefone</TableHead>
                  <TableHead className="text-xs py-2">Instância</TableHead>
                  <TableHead className="text-xs py-2">Status</TableHead>
                  <TableHead className="text-xs py-2">Horário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.slice(0, compact ? 5 : 10).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs py-1.5">{log.phone}</TableCell>
                    <TableCell className="py-1.5">
                      <div className="flex items-center gap-1.5">
                        <div 
                          className="h-2 w-2 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: log.instanceColor }}
                        />
                        <span className="text-xs truncate">{log.instanceName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">
                      {log.status === 'sent' ? (
                        <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-[10px] px-1.5 py-0">
                          <CheckCircle className="h-2.5 w-2.5 mr-0.5" />
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                          Erro
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground py-1.5">
                      {log.sent_at ? new Date(log.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
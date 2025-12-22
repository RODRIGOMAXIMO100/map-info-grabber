import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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

export default function InstanceMonitor() {
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

      // Data de hoje (meia-noite)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Buscar logs de hoje
      const { data: logsToday } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .gte('sent_at', todayISO)
        .order('sent_at', { ascending: false });

      // Buscar mensagens pendentes na fila por config_id
      const { data: pendingQueue } = await supabase
        .from('whatsapp_queue')
        .select('config_id')
        .eq('status', 'pending');

      // Processar estatísticas por instância
      const stats: InstanceStats[] = configs.map(config => {
        const configLogs = logsToday?.filter(log => log.config_id === config.id) || [];
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

      logsToday?.forEach(log => {
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
      const recent: RecentLog[] = (logsToday || []).slice(0, 10).map(log => {
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

  useEffect(() => {
    loadMonitorData();

    // Realtime subscription para logs
    const channel = supabase
      .channel('instance-monitor-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_logs' },
        () => loadMonitorData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_queue' },
        () => loadMonitorData()
      )
      .subscribe();

    // Atualizar a cada 30 segundos
    const interval = setInterval(loadMonitorData, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Monitor de Instâncias
          </h2>
          <p className="text-sm text-muted-foreground">Distribuição e status em tempo real</p>
        </div>
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{totalSentToday} enviadas</span>
          </div>
          <div className="flex items-center gap-1">
            <XCircle className="h-4 w-4 text-destructive" />
            <span>{totalFailedToday} falhas</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{totalPending} pendentes</span>
          </div>
        </div>
      </div>

      {/* Cards de Instâncias */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {instanceStats.map((instance) => (
          <Card key={instance.id} className="relative overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-1 h-full" 
              style={{ backgroundColor: instance.color }}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  {instance.name}
                </CardTitle>
                <Badge variant={instance.isActive ? "default" : "secondary"}>
                  {instance.isActive ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <CardDescription className="font-mono text-xs">
                {instance.phone}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-green-600">{instance.sentToday}</div>
                  <div className="text-xs text-muted-foreground">Enviadas</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-destructive">{instance.failedToday}</div>
                  <div className="text-xs text-muted-foreground">Falhas</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-muted-foreground">{instance.pending}</div>
                  <div className="text-xs text-muted-foreground">Pendentes</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Taxa de sucesso</span>
                  <span>{instance.successRate}%</span>
                </div>
                <Progress value={instance.successRate} className="h-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Gráfico de Pizza */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Distribuição de Envios (Hoje)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Envios por Hora (Hoje)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
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
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4" />
            Últimos Envios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Send className="h-8 w-8 mb-2" />
              <p>Nenhum envio registrado hoje</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Horário</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">{log.phone}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-2 w-2 rounded-full" 
                          style={{ backgroundColor: log.instanceColor }}
                        />
                        <span className="text-sm">{log.instanceName}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.status === 'sent' ? (
                        <Badge variant="default" className="bg-green-500 hover:bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Enviado
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Falha
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.sent_at ? new Date(log.sent_at).toLocaleTimeString('pt-BR') : '-'}
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
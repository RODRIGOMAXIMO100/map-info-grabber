import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock } from 'lucide-react';

interface HourlyActivity {
  hour: string;
  count: number;
}

interface ActivityHeatmapChartProps {
  data: HourlyActivity[];
  loading?: boolean;
}

export default function ActivityHeatmapChart({ data, loading }: ActivityHeatmapChartProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Atividade por Hora
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  const getBarColor = (count: number) => {
    const intensity = count / maxCount;
    if (intensity === 0) return 'hsl(var(--muted))';
    if (intensity < 0.25) return 'hsl(210, 60%, 80%)';
    if (intensity < 0.5) return 'hsl(210, 70%, 65%)';
    if (intensity < 0.75) return 'hsl(210, 80%, 50%)';
    return 'hsl(210, 90%, 40%)';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Atividade por Hora
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                formatter={(value: number) => [`${value} mensagens`, 'Quantidade']}
                labelFormatter={(label) => `${label}:00`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.count)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-4 mt-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded bg-[hsl(210,60%,80%)]" />
            <span>Baixa</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded bg-[hsl(210,80%,50%)]" />
            <span>Média</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-3 h-3 rounded bg-[hsl(210,90%,40%)]" />
            <span>Alta</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

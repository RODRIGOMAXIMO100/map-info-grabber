import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { VendorMetrics } from './TeamMetricsTable';

interface PerformanceChartProps {
  data: VendorMetrics[];
}

type MetricType = 'conversions' | 'value' | 'leads';

export default function PerformanceChart({ data }: PerformanceChartProps) {
  const [metric, setMetric] = useState<MetricType>('conversions');

  if (data.length === 0) return null;

  const getChartData = () => {
    return data.map(vendor => ({
      name: vendor.full_name.split(' ')[0], // Apenas primeiro nome
      fullName: vendor.full_name,
      value: metric === 'conversions' 
        ? vendor.leads_converted 
        : metric === 'value' 
          ? vendor.closed_value 
          : vendor.leads_assigned,
      role: vendor.role,
    })).sort((a, b) => b.value - a.value).slice(0, 10); // Top 10
  };

  const chartData = getChartData();
  const maxValue = Math.max(...chartData.map(d => d.value));

  const getBarColor = (role: string) => {
    return role === 'sdr' ? 'hsl(217, 91%, 60%)' : 'hsl(142, 71%, 45%)';
  };

  const formatValue = (value: number) => {
    if (metric === 'value') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        notation: 'compact',
      }).format(value);
    }
    return value.toString();
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'conversions': return 'Conversões';
      case 'value': return 'Valor Fechado';
      case 'leads': return 'Leads Atribuídos';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Comparativo da Equipe</CardTitle>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
          <TabsList className="h-8">
            <TabsTrigger value="conversions" className="text-xs px-3">Conversões</TabsTrigger>
            <TabsTrigger value="value" className="text-xs px-3">Valor</TabsTrigger>
            <TabsTrigger value="leads" className="text-xs px-3">Leads</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis 
                type="number" 
                domain={[0, maxValue * 1.1]}
                tickFormatter={formatValue}
              />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={80}
                tick={{ fontSize: 12 }}
              />
              <Tooltip 
                formatter={(value: number) => [formatValue(value), getMetricLabel()]}
                labelFormatter={(label) => chartData.find(d => d.name === label)?.fullName || label}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.role)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-muted-foreground">SDR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Closer</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

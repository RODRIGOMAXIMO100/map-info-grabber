import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, GitCompare } from "lucide-react";
import type { ComparisonMetric } from "@/hooks/useDashboardData";

interface PeriodComparisonProps {
  data: ComparisonMetric[];
  periodDays: number;
  loading?: boolean;
}

export default function PeriodComparison({ data, periodDays, loading = false }: PeriodComparisonProps) {

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const formatValue = (value: number, format: 'number' | 'currency' | 'percent'): string => {
    switch (format) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percent':
        return `${value}%`;
      default:
        return value.toString();
    }
  };

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4" />;
    if (change < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getChangeColor = (change: number): string => {
    if (change > 0) return 'text-green-600 bg-green-50 border-green-200';
    if (change < 0) return 'text-red-600 bg-red-50 border-red-200';
    return 'text-muted-foreground bg-muted border-border';
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-5 w-5" />
            Comparativo
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

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-5 w-5" />
          Comparativo de Período
        </CardTitle>
        <CardDescription className="text-xs">
          vs. {periodDays} dias anteriores
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {data.map((metric) => {
            const change = calculateChange(metric.current, metric.previous);
            
            return (
              <div key={metric.label} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm text-muted-foreground">{metric.label}</p>
                  <p className="text-lg font-bold">{formatValue(metric.current, metric.format)}</p>
                </div>
                <Badge 
                  variant="outline" 
                  className={`flex items-center gap-1 ${getChangeColor(change)}`}
                >
                  {getChangeIcon(change)}
                  {change > 0 ? '+' : ''}{change}%
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

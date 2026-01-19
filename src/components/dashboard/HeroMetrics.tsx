import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  TrendingDown,
  Clock,
  Minus
} from "lucide-react";
import type { HeroMetricsData } from "@/hooks/useDashboardData";

interface HeroMetricsProps {
  data: HeroMetricsData;
  loading?: boolean;
}

type MetricFormat = 'currency' | 'number' | 'percent' | 'days';

export default function HeroMetrics({ data, loading = false }: HeroMetricsProps) {

  const formatValue = (value: number, format: MetricFormat) => {
    switch (format) {
      case 'currency':
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      case 'percent':
        return `${value}%`;
      case 'days':
        return `${value}d`;
      default:
        return value.toLocaleString('pt-BR');
    }
  };

  const calculateChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const getChangeDisplay = (change: number, isInverse: boolean = false) => {
    // For cycle days, lower is better (inverse)
    const isPositive = isInverse ? change < 0 : change > 0;
    const isNegative = isInverse ? change > 0 : change < 0;
    
    if (change === 0) {
      return {
        icon: <Minus className="h-3 w-3" />,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
    }
    
    return {
      icon: isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />,
      color: isPositive ? 'text-green-600' : 'text-red-600',
      bgColor: isPositive ? 'bg-green-50 dark:bg-green-950' : 'bg-red-50 dark:bg-red-950',
    };
  };

  const heroCards = [
    {
      title: 'Valor Fechado',
      icon: DollarSign,
      current: data.closedValue.current,
      previous: data.closedValue.previous,
      format: 'currency' as MetricFormat,
      iconColor: 'text-green-600',
      iconBg: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Leads no Pipeline',
      icon: Users,
      current: data.pipelineLeads.current,
      previous: data.pipelineLeads.previous,
      format: 'number' as MetricFormat,
      iconColor: 'text-blue-600',
      iconBg: 'bg-blue-100 dark:bg-blue-900',
    },
    {
      title: 'Taxa de Conversão',
      icon: TrendingUp,
      current: data.conversionRate.current,
      previous: data.conversionRate.previous,
      format: 'percent' as MetricFormat,
      iconColor: 'text-purple-600',
      iconBg: 'bg-purple-100 dark:bg-purple-900',
    },
    {
      title: 'Ciclo Médio',
      icon: Clock,
      current: data.avgCycleDays.current,
      previous: data.avgCycleDays.previous,
      format: 'days' as MetricFormat,
      iconColor: 'text-orange-600',
      iconBg: 'bg-orange-100 dark:bg-orange-900',
      isInverse: true, // Lower is better
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {heroCards.map((card) => {
        const change = calculateChange(card.current, card.previous);
        const changeDisplay = getChangeDisplay(change, card.isInverse);
        const Icon = card.icon;

        return (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="text-3xl font-bold tracking-tight">
                    {formatValue(card.current, card.format)}
                  </p>
                </div>
                <div className={`p-2.5 rounded-lg ${card.iconBg}`}>
                  <Icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
              </div>
              
              <div className="mt-4 flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={`${changeDisplay.bgColor} ${changeDisplay.color} border-0 gap-1`}
                >
                  {changeDisplay.icon}
                  {Math.abs(change)}%
                </Badge>
                <span className="text-xs text-muted-foreground">
                  vs período anterior
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

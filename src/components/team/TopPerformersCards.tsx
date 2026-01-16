import { Card, CardContent } from '@/components/ui/card';
import { Trophy, DollarSign, TrendingUp, MessageSquare } from 'lucide-react';
import { VendorMetrics } from './TeamMetricsTable';

interface TopPerformersCardsProps {
  data: VendorMetrics[];
}

export default function TopPerformersCards({ data }: TopPerformersCardsProps) {
  if (data.length === 0) return null;

  const topConversions = [...data].sort((a, b) => b.leads_converted - a.leads_converted)[0];
  const topValue = [...data].sort((a, b) => b.closed_value - a.closed_value)[0];
  const topRate = [...data].sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
  const topMessages = [...data].sort((a, b) => b.messages_sent - a.messages_sent)[0];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value);
  };

  const cards = [
    {
      title: 'Top Conversões',
      icon: Trophy,
      vendor: topConversions?.full_name || '-',
      value: `${topConversions?.leads_converted || 0} vendas`,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      title: 'Maior Valor',
      icon: DollarSign,
      vendor: topValue?.full_name || '-',
      value: formatCurrency(topValue?.closed_value || 0),
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Melhor Taxa',
      icon: TrendingUp,
      vendor: topRate?.full_name || '-',
      value: `${topRate?.conversion_rate.toFixed(1) || 0}%`,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Mais Ativo',
      icon: MessageSquare,
      vendor: topMessages?.full_name || '-',
      value: `${topMessages?.messages_sent || 0} msgs`,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="font-semibold mt-1 truncate">{card.vendor}</p>
                <p className={`text-lg font-bold mt-1 ${card.color}`}>{card.value}</p>
              </div>
              <div className={`p-2 rounded-lg ${card.bgColor}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

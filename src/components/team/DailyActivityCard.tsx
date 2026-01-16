import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, isToday, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, Clock, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DailyActivity {
  user_id: string;
  full_name: string;
  role: string;
  messages_today: number;
  first_activity: string | null;
  last_activity: string | null;
  leads_without_contact: number;
}

interface DailyActivityCardProps {
  data: DailyActivity[];
  loading?: boolean;
}

export default function DailyActivityCard({ data, loading }: DailyActivityCardProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Atividade Hoje
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  const getActivityStatus = (activity: DailyActivity) => {
    if (activity.messages_today === 0) {
      return 'inactive';
    }
    if (activity.last_activity) {
      const minutesSince = differenceInMinutes(new Date(), new Date(activity.last_activity));
      if (minutesSince < 30) return 'active';
      if (minutesSince < 120) return 'recent';
    }
    return 'idle';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500 text-white text-xs px-1.5 py-0">Online</Badge>;
      case 'recent':
        return <Badge className="bg-yellow-500 text-white text-xs px-1.5 py-0">Ausente</Badge>;
      case 'idle':
        return <Badge variant="secondary" className="text-xs px-1.5 py-0">Inativo</Badge>;
      default:
        return <Badge variant="destructive" className="text-xs px-1.5 py-0">Sem Atividade</Badge>;
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    return format(date, 'HH:mm', { locale: ptBR });
  };

  // Ordenar: ativos primeiro, depois por mensagens
  const sortedData = [...data].sort((a, b) => {
    const statusA = getActivityStatus(a);
    const statusB = getActivityStatus(b);
    
    const statusOrder = { active: 0, recent: 1, idle: 2, inactive: 3 };
    if (statusOrder[statusA as keyof typeof statusOrder] !== statusOrder[statusB as keyof typeof statusOrder]) {
      return statusOrder[statusA as keyof typeof statusOrder] - statusOrder[statusB as keyof typeof statusOrder];
    }
    return b.messages_today - a.messages_today;
  });

  const totalMessagesToday = data.reduce((sum, d) => sum + d.messages_today, 0);
  const activeCount = data.filter(d => getActivityStatus(d) === 'active' || getActivityStatus(d) === 'recent').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Atividade Hoje
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{activeCount}/{data.length} ativos</span>
            <span>•</span>
            <span>{totalMessagesToday} msgs</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {sortedData.map((activity) => {
            const status = getActivityStatus(activity);
            return (
              <div 
                key={activity.user_id} 
                className={cn(
                  "flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors",
                  status === 'inactive' && "opacity-60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    status === 'active' && "bg-green-500",
                    status === 'recent' && "bg-yellow-500",
                    status === 'idle' && "bg-muted-foreground",
                    status === 'inactive' && "bg-red-500"
                  )} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{activity.full_name}</span>
                      {getStatusBadge(status)}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(activity.first_activity)} - {formatTime(activity.last_activity)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className={cn(
                      "font-medium",
                      activity.messages_today > 0 ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {activity.messages_today}
                    </span>
                  </div>
                  {activity.leads_without_contact > 0 && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs font-medium">{activity.leads_without_contact}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

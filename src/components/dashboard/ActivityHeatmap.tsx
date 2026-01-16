import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarDays } from "lucide-react";
import { format, eachDayOfInterval, startOfDay, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DayActivity {
  date: Date;
  count: number;
  displayDate: string;
}

interface ActivityHeatmapProps {
  funnelId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export default function ActivityHeatmap({ funnelId, startDate, endDate }: ActivityHeatmapProps) {
  const [days, setDays] = useState<DayActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxCount, setMaxCount] = useState(1);

  useEffect(() => {
    loadActivity();
  }, [funnelId, startDate, endDate]);

  const loadActivity = async () => {
    try {
      setLoading(true);

      // Use provided dates or default to last 30 days
      const heatmapEndDate = endDate || new Date();
      const heatmapStartDate = startDate || new Date(heatmapEndDate.getTime() - 29 * 24 * 60 * 60 * 1000);
      
      const daysInRange = eachDayOfInterval({ start: heatmapStartDate, end: heatmapEndDate });
      const periodDays = differenceInDays(heatmapEndDate, heatmapStartDate) + 1;

      // Get conversations for this funnel
      const { data: conversations } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId);

      const conversationIds = (conversations || []).map(c => c.id);

      if (conversationIds.length === 0) {
        setDays(daysInRange.map(date => ({
          date,
          count: 0,
          displayDate: format(date, 'EEEE, d MMM', { locale: ptBR })
        })));
        setLoading(false);
        return;
      }

      // Get messages per day
      const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('created_at')
        .in('conversation_id', conversationIds)
        .gte('created_at', heatmapStartDate.toISOString())
        .lte('created_at', heatmapEndDate.toISOString());

      // Count messages per day
      const countsByDay: Record<string, number> = {};
      (messages || []).forEach(msg => {
        const dayKey = format(startOfDay(new Date(msg.created_at!)), 'yyyy-MM-dd');
        countsByDay[dayKey] = (countsByDay[dayKey] || 0) + 1;
      });

      const max = Math.max(...Object.values(countsByDay), 1);
      setMaxCount(max);

      const activityData: DayActivity[] = daysInRange.map(date => ({
        date,
        count: countsByDay[format(date, 'yyyy-MM-dd')] || 0,
        displayDate: format(date, 'EEEE, d MMM', { locale: ptBR })
      }));

      setDays(activityData);
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIntensityClass = (count: number): string => {
    if (count === 0) return 'bg-muted';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'bg-primary/20';
    if (ratio < 0.5) return 'bg-primary/40';
    if (ratio < 0.75) return 'bg-primary/60';
    return 'bg-primary/90';
  };

  // Calculate period description
  const getPeriodDescription = () => {
    if (!startDate && !endDate) return 'Últimos 30 dias';
    const periodDays = days.length;
    return `${periodDays} dias`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-5 w-5" />
            Atividade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-20">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Split into weeks (7 days each for display)
  const weeks: DayActivity[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-5 w-5" />
          Atividade - {getPeriodDescription()}
        </CardTitle>
        <CardDescription className="text-xs">
          Mensagens enviadas/recebidas por dia
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="flex flex-col gap-1">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex gap-1">
                {week.map((day, dayIdx) => (
                  <Tooltip key={dayIdx}>
                    <TooltipTrigger asChild>
                      <div
                        className={`w-4 h-4 rounded-sm cursor-pointer transition-colors hover:ring-2 hover:ring-primary/50 ${getIntensityClass(day.count)}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-medium">{day.displayDate}</p>
                      <p>{day.count} mensagens</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </TooltipProvider>
        
        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-3 text-xs text-muted-foreground">
          <span>Menos</span>
          <div className="w-3 h-3 rounded-sm bg-muted" />
          <div className="w-3 h-3 rounded-sm bg-primary/20" />
          <div className="w-3 h-3 rounded-sm bg-primary/40" />
          <div className="w-3 h-3 rounded-sm bg-primary/60" />
          <div className="w-3 h-3 rounded-sm bg-primary/90" />
          <span>Mais</span>
        </div>
      </CardContent>
    </Card>
  );
}

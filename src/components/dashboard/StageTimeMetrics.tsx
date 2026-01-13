import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface StageTime {
  stageId: string;
  avgDays: number;
}

interface StageTimeMetricsProps {
  funnelId: string;
  stageId: string;
}

export default function StageTimeMetrics({ funnelId, stageId }: StageTimeMetricsProps) {
  const [avgDays, setAvgDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculateAvgTime();
  }, [funnelId, stageId]);

  const calculateAvgTime = async () => {
    try {
      setLoading(true);

      // Get stage history entries where leads moved FROM this stage
      const { data: historyData } = await supabase
        .from('funnel_stage_history')
        .select('conversation_id, from_stage_id, to_stage_id, changed_at')
        .eq('from_stage_id', stageId)
        .order('changed_at', { ascending: true })
        .limit(100);

      if (!historyData || historyData.length === 0) {
        setAvgDays(null);
        setLoading(false);
        return;
      }

      // Get when leads entered this stage
      const { data: entryData } = await supabase
        .from('funnel_stage_history')
        .select('conversation_id, to_stage_id, changed_at')
        .eq('to_stage_id', stageId)
        .order('changed_at', { ascending: true });

      if (!entryData) {
        setAvgDays(null);
        setLoading(false);
        return;
      }

      // Calculate time spent in stage for each lead
      const entryMap = new Map<string, Date>();
      entryData.forEach(entry => {
        // Keep the earliest entry date
        if (!entryMap.has(entry.conversation_id!)) {
          entryMap.set(entry.conversation_id!, new Date(entry.changed_at!));
        }
      });

      const durations: number[] = [];
      historyData.forEach(exit => {
        const entryDate = entryMap.get(exit.conversation_id!);
        if (entryDate) {
          const exitDate = new Date(exit.changed_at!);
          const days = (exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
          if (days > 0 && days < 365) { // Ignore outliers
            durations.push(days);
          }
        }
      });

      if (durations.length > 0) {
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        setAvgDays(Math.round(avg * 10) / 10);
      } else {
        setAvgDays(null);
      }
    } catch (error) {
      console.error('Error calculating avg time:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <span className="text-xs text-muted-foreground">...</span>;
  }

  if (avgDays === null) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  const getBadgeColor = () => {
    if (avgDays <= 2) return 'text-green-600 border-green-300 bg-green-50';
    if (avgDays <= 5) return 'text-yellow-600 border-yellow-300 bg-yellow-50';
    return 'text-red-600 border-red-300 bg-red-50';
  };

  return (
    <Badge variant="outline" className={`text-xs ${getBadgeColor()}`}>
      <Clock className="h-3 w-3 mr-1" />
      {avgDays}d
    </Badge>
  );
}

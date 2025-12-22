import { useMemo } from 'react';
import { Users, Flame, Snowflake, CheckCircle, TrendingUp, Bell } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation } from '@/types/whatsapp';
import { CRM_STAGES } from '@/types/whatsapp';

interface CRMMetricsBarProps {
  conversations: WhatsAppConversation[];
}

export function CRMMetricsBar({ conversations }: CRMMetricsBarProps) {
  const metrics = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;

    // Hot leads: last message < 1 hour ago
    const hotLeads = conversations.filter(c => {
      if (!c.last_message_at) return false;
      return new Date(c.last_message_at).getTime() > oneHourAgo;
    }).length;

    // Cold leads: no response > 24 hours
    const coldLeads = conversations.filter(c => {
      if (!c.last_message_at) return true;
      return new Date(c.last_message_at).getTime() < oneDayAgo;
    }).length;

    // Handoff stage label_id
    const handoffLabelId = CRM_STAGES.find(s => s.name.includes('Handoff'))?.label_id;
    const closedLabelId = CRM_STAGES.find(s => s.name.includes('Fechado'))?.label_id;

    // Converted today (in Handoff or Closed stage, moved today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const convertedToday = conversations.filter(c => {
      const hasHandoffTag = c.tags?.includes(handoffLabelId || '') || c.tags?.includes(closedLabelId || '');
      const updatedToday = new Date(c.updated_at) >= today;
      return hasHandoffTag && updatedToday;
    }).length;

    // Leads with pending reminders
    const pendingReminders = conversations.filter(c => {
      if (!c.reminder_at) return false;
      return new Date(c.reminder_at).getTime() <= now;
    }).length;

    // Response rate (leads that have messages from us / total)
    const withResponse = conversations.filter(c => c.last_message_preview).length;
    const responseRate = conversations.length > 0 
      ? Math.round((withResponse / conversations.length) * 100) 
      : 0;

    return {
      total: conversations.length,
      hotLeads,
      coldLeads,
      convertedToday,
      pendingReminders,
      responseRate,
    };
  }, [conversations]);

  const MetricCard = ({ 
    icon: Icon, 
    label, 
    value, 
    color,
    highlight = false 
  }: { 
    icon: React.ElementType;
    label: string;
    value: number | string;
    color: string;
    highlight?: boolean;
  }) => (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-lg",
      highlight && "bg-primary/10 border border-primary/20"
    )}>
      <Icon className={cn("h-4 w-4", color)} />
      <span className="text-xs text-muted-foreground hidden sm:inline">{label}</span>
      <Badge variant={highlight ? "default" : "secondary"} className="text-xs font-semibold">
        {value}
      </Badge>
    </div>
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
      <MetricCard
        icon={Users}
        label="Total"
        value={metrics.total}
        color="text-blue-500"
      />
      <MetricCard
        icon={Flame}
        label="Quentes"
        value={metrics.hotLeads}
        color="text-orange-500"
        highlight={metrics.hotLeads > 0}
      />
      <MetricCard
        icon={Snowflake}
        label="Frios"
        value={metrics.coldLeads}
        color="text-cyan-500"
      />
      <MetricCard
        icon={CheckCircle}
        label="Convertidos Hoje"
        value={metrics.convertedToday}
        color="text-green-500"
      />
      <MetricCard
        icon={Bell}
        label="Lembretes"
        value={metrics.pendingReminders}
        color="text-amber-500"
        highlight={metrics.pendingReminders > 0}
      />
      <MetricCard
        icon={TrendingUp}
        label="Taxa Resposta"
        value={`${metrics.responseRate}%`}
        color="text-purple-500"
      />
    </div>
  );
}
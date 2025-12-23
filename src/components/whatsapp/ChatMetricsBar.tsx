import { Bot, BotOff, Users, Clock, HandshakeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMetrics {
  total: number;
  aiActive: number;
  aiPaused: number;
  waiting: number;
  handoff: number;
}

interface ChatMetricsBarProps {
  metrics: ChatMetrics;
  onFilterClick: (filter: string) => void;
  activeFilter?: string;
}

export function ChatMetricsBar({ metrics, onFilterClick, activeFilter }: ChatMetricsBarProps) {
  const items = [
    { 
      key: 'all', 
      label: 'Total', 
      value: metrics.total, 
      icon: Users, 
      color: 'text-foreground',
      bgColor: 'bg-muted hover:bg-muted/80'
    },
    { 
      key: 'ai_active', 
      label: 'IA Ativa', 
      value: metrics.aiActive, 
      icon: Bot, 
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50'
    },
    { 
      key: 'ai_paused', 
      label: 'Pausadas', 
      value: metrics.aiPaused, 
      icon: BotOff, 
      color: 'text-amber-600',
      bgColor: 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50'
    },
    { 
      key: 'waiting', 
      label: 'Aguardando', 
      value: metrics.waiting, 
      icon: Clock, 
      color: 'text-blue-600',
      bgColor: 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50'
    },
    { 
      key: 'handoff', 
      label: 'Handoff', 
      value: metrics.handoff, 
      icon: HandshakeIcon, 
      color: 'text-red-600',
      bgColor: 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50'
    },
  ];

  return (
    <div className="flex items-center gap-2 p-2 bg-card border-b overflow-x-auto">
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onFilterClick(item.key)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
            item.bgColor,
            activeFilter === item.key && "ring-2 ring-primary ring-offset-1"
          )}
        >
          <item.icon className={cn("h-3.5 w-3.5", item.color)} />
          <span className={item.color}>{item.value}</span>
          <span className="text-muted-foreground hidden sm:inline">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

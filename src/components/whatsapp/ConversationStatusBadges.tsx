import { Bot, BotOff, Clock, HandshakeIcon, Sparkles, MessageCircle, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Unified funnel stage IDs - same as CRM_STAGES in types/whatsapp.ts
export type FunnelStageId = 'new' | 'presentation' | 'interest' | 'negotiating' | 'handoff' | 'converted' | 'lost';

export interface FunnelStage {
  id: FunnelStageId;
  label: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const FUNNEL_STAGES: FunnelStage[] = [
  { id: 'new', label: 'Lead Novo', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30', icon: Sparkles },
  { id: 'presentation', label: 'Apresentação', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-900/30', icon: MessageCircle },
  { id: 'interest', label: 'Interesse', color: 'text-cyan-600', bgColor: 'bg-cyan-100 dark:bg-cyan-900/30', icon: Sparkles },
  { id: 'negotiating', label: 'Negociando', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-900/30', icon: Clock },
  { id: 'handoff', label: 'Handoff', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30', icon: HandshakeIcon },
  { id: 'converted', label: 'Convertido', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', icon: CheckCircle },
  { id: 'lost', label: 'Perdido', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-900/30', icon: XCircle },
];

interface Conversation {
  is_crm_lead?: boolean;
  ai_paused?: boolean;
  ai_handoff_reason?: string;
  is_group?: boolean;
  site_sent?: boolean;
  video_sent?: boolean;
  converted_at?: string;
  status?: string;
  tags?: string[];
  last_message_at?: string;
  last_lead_message_at?: string;
  funnel_stage?: string;
}

const VALID_STAGES: FunnelStageId[] = ['new', 'presentation', 'interest', 'negotiating', 'handoff', 'converted', 'lost'];

export function detectFunnelStage(conv: Conversation): FunnelStageId {
  // Use funnel_stage from database directly
  if (conv.funnel_stage && VALID_STAGES.includes(conv.funnel_stage as FunnelStageId)) {
    return conv.funnel_stage as FunnelStageId;
  }
  // Fallback to 'new' if not set
  return 'new';
}

export function calculateWaitingTime(lastMessageAt?: string): number {
  if (!lastMessageAt) return 0;
  const now = new Date();
  const lastMsg = new Date(lastMessageAt);
  return Math.floor((now.getTime() - lastMsg.getTime()) / (1000 * 60 * 60)); // hours
}

export function formatWaitingTime(hours: number): string {
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface AIStatusIconProps {
  conversation: Conversation;
  className?: string;
}

export function AIStatusIcon({ conversation, className }: AIStatusIconProps) {
  const isLead = conversation.is_crm_lead;
  const isPaused = conversation.ai_paused;
  const isHandoff = !!conversation.ai_handoff_reason;
  const isGroup = conversation.is_group;

  if (isGroup) {
    return null; // No AI for groups
  }

  if (!isLead) {
    return (
      <div className={cn("flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700", className)}>
        <BotOff className="h-3 w-3 text-gray-500" />
      </div>
    );
  }

  if (isHandoff) {
    return (
      <div className={cn("flex items-center justify-center w-5 h-5 rounded-full bg-red-100 dark:bg-red-900/30", className)}>
        <HandshakeIcon className="h-3 w-3 text-red-600" />
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className={cn("flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30", className)}>
        <BotOff className="h-3 w-3 text-amber-600" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30", className)}>
      <Bot className="h-3 w-3 text-emerald-600" />
    </div>
  );
}

interface FunnelStageBadgeProps {
  stage: FunnelStageId;
  compact?: boolean;
  className?: string;
}

export function FunnelStageBadge({ stage, compact = false, className }: FunnelStageBadgeProps) {
  const stageConfig = FUNNEL_STAGES.find(s => s.id === stage) || FUNNEL_STAGES[0];
  const Icon = stageConfig.icon;

  if (compact) {
    return (
      <div 
        className={cn(
          "flex items-center justify-center w-5 h-5 rounded-full",
          stageConfig.bgColor,
          className
        )}
        title={stageConfig.label}
      >
        <Icon className={cn("h-3 w-3", stageConfig.color)} />
      </div>
    );
  }

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-[10px] px-1.5 py-0 h-4 font-normal",
        stageConfig.bgColor,
        stageConfig.color,
        className
      )}
    >
      <Icon className="h-2.5 w-2.5 mr-0.5" />
      {stageConfig.label}
    </Badge>
  );
}

interface WaitingTimeBadgeProps {
  lastMessageAt?: string;
  className?: string;
}

export function WaitingTimeBadge({ lastMessageAt, className }: WaitingTimeBadgeProps) {
  const hours = calculateWaitingTime(lastMessageAt);
  
  if (hours < 1) return null;

  const isUrgent = hours >= 24;
  const isWarning = hours >= 6;

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-[10px] px-1.5 py-0 h-4 font-normal",
        isUrgent 
          ? "bg-red-100 text-red-600 dark:bg-red-900/30" 
          : isWarning 
            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30"
            : "bg-blue-100 text-blue-600 dark:bg-blue-900/30",
        className
      )}
    >
      <Clock className="h-2.5 w-2.5 mr-0.5" />
      {formatWaitingTime(hours)}
    </Badge>
  );
}

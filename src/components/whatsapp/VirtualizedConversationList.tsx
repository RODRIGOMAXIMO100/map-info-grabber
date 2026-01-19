import { useCallback, type CSSProperties, type ReactElement } from 'react';
import { List, useListRef } from 'react-window';
import { Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AIStatusIcon, FunnelStageBadge, WaitingTimeBadge, detectFunnelStage } from '@/components/whatsapp';
import type { WhatsAppConversation } from '@/types/whatsapp';

interface WhatsAppInstance {
  id: string;
  name: string;
  color: string;
  instance_phone: string;
  is_active: boolean;
}

interface ConversationWithInstance extends WhatsAppConversation {
  config_id?: string;
  instance?: WhatsAppInstance;
}

interface ConversationRowProps {
  conversations: ConversationWithInstance[];
  selectedId: string | null;
  onSelect: (conv: ConversationWithInstance) => void;
  formatTime: (date: string) => string;
  formatPreview: (preview: string | null) => string;
}

interface VirtualizedConversationListProps {
  conversations: ConversationWithInstance[];
  selectedConversationId: string | null;
  onSelectConversation: (conv: ConversationWithInstance) => void;
  height: number;
  formatTime: (date: string) => string;
  formatPreview: (preview: string | null) => string;
}

const ITEM_HEIGHT = 72; // Fixed height for each conversation row

const isGroup = (conv: ConversationWithInstance): boolean => {
  return conv.is_group === true || conv.phone.includes('@g.us');
};

// Row component - must return ReactElement, not ReactNode
function ConversationRow({ 
  index,
  style,
  conversations,
  selectedId,
  onSelect,
  formatTime,
  formatPreview,
}: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: CSSProperties;
} & ConversationRowProps): ReactElement {
  const conv = conversations[index];
  
  if (!conv) {
    return <div style={style} />;
  }

  const funnelStage = detectFunnelStage(conv);

  return (
    <div
      style={style}
      onClick={() => onSelect(conv)}
      className={cn(
        'px-3 py-3 border-b cursor-pointer transition-colors',
        selectedId === conv.id && 'bg-muted',
        conv.ai_handoff_reason 
          ? 'bg-red-50/50 hover:bg-red-100/50 dark:bg-red-950/20 dark:hover:bg-red-950/30'
          : conv.ai_paused 
            ? 'bg-amber-50/50 hover:bg-amber-100/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30'
            : conv.is_crm_lead && !conv.ai_paused 
              ? 'bg-emerald-50/30 hover:bg-emerald-100/30 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20'
              : 'hover:bg-muted/50'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative flex-shrink-0">
          <Avatar className="h-10 w-10">
            {conv.avatar_url && <AvatarImage src={conv.avatar_url} alt={conv.name || ''} />}
            <AvatarFallback className="text-sm">
              {isGroup(conv) ? (
                <Users className="h-5 w-5" />
              ) : (
                conv.name?.charAt(0).toUpperCase() || conv.phone.slice(-2)
              )}
            </AvatarFallback>
          </Avatar>
          {conv.instance && (
            <div 
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background"
              style={{ backgroundColor: conv.instance.color }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {conv.is_crm_lead && <AIStatusIcon conversation={conv} />}
              {isGroup(conv) && <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
              <span className="font-medium truncate text-sm max-w-[80px]">
                {conv.name || conv.group_name || conv.phone}
              </span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {conv.is_crm_lead && <FunnelStageBadge stage={funnelStage} compact />}
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatTime(conv.last_message_at)}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground truncate max-w-[140px]">
              {formatPreview(conv.last_message_preview)}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              <WaitingTimeBadge lastMessageAt={conv.last_lead_message_at || conv.last_message_at} />
              {(conv.unread_count ?? 0) > 0 && (
                <Badge className="h-5 min-w-5 flex items-center justify-center text-xs px-1.5">
                  {conv.unread_count}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VirtualizedConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  height,
  formatTime,
  formatPreview,
}: VirtualizedConversationListProps) {
  const listRef = useListRef();

  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Nenhuma conversa encontrada
      </div>
    );
  }

  return (
    <List
      listRef={listRef}
      style={{ height, width: '100%' }}
      rowCount={conversations.length}
      rowHeight={ITEM_HEIGHT}
      overscanCount={5}
      rowComponent={ConversationRow}
      rowProps={{
        conversations,
        selectedId: selectedConversationId,
        onSelect: onSelectConversation,
        formatTime,
        formatPreview,
      }}
    />
  );
}

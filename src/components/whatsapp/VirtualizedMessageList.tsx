import { useEffect, useMemo, type CSSProperties, type ReactElement } from 'react';
import { List, useListRef, useDynamicRowHeight } from 'react-window';
import { Clock, Check, CheckCheck, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MessageContent } from '@/components/whatsapp/MessageContent';
import type { WhatsAppMessage } from '@/types/whatsapp';

interface MessageRowProps {
  messages: WhatsAppMessage[];
  formatTime: (date: string) => string;
  formatDate: (date: string) => string;
  showDateForIndex: boolean[];
}

interface VirtualizedMessageListProps {
  messages: WhatsAppMessage[];
  height: number;
  formatTime: (date: string) => string;
  formatDate: (date: string) => string;
}

const DEFAULT_MESSAGE_HEIGHT = 80;

// Row component - must return ReactElement, not ReactNode
function MessageRow({ 
  index,
  style,
  messages,
  formatTime,
  formatDate,
  showDateForIndex,
}: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: CSSProperties;
} & MessageRowProps): ReactElement {
  const msg = messages[index];
  
  if (!msg) {
    return <div style={style} />;
  }

  const showDate = showDateForIndex[index];

  return (
    <div style={style} className="px-4">
      {showDate && (
        <div className="flex justify-center my-4">
          <span className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
            {formatDate(msg.created_at)}
          </span>
        </div>
      )}
      <div className={cn(
        'flex',
        msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
      )}>
        <div className={cn(
          'max-w-[70%] rounded-lg px-3 py-2 overflow-hidden',
          msg.direction === 'outgoing' 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted'
        )}>
          <MessageContent
            content={msg.content}
            messageType={msg.message_type}
            mediaUrl={msg.media_url}
            direction={msg.direction as 'incoming' | 'outgoing'}
          />
          <span className={cn(
            'text-[10px] mt-1 flex items-center justify-end gap-1',
            msg.direction === 'outgoing' 
              ? 'text-primary-foreground/70' 
              : 'text-muted-foreground'
          )}>
            {formatTime(msg.created_at)}
            {msg.direction === 'outgoing' && (
              <>
                {msg.status === 'pending' && <Clock className="h-3 w-3 animate-pulse" />}
                {msg.status === 'sent' && <Check className="h-3 w-3" />}
                {msg.status === 'delivered' && <CheckCheck className="h-3 w-3" />}
                {msg.status === 'read' && <CheckCheck className="h-3 w-3 text-blue-400" />}
                {msg.status === 'failed' && <AlertCircle className="h-3 w-3 text-red-400" />}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function VirtualizedMessageList({
  messages,
  height,
  formatTime,
  formatDate,
}: VirtualizedMessageListProps) {
  const listRef = useListRef();
  
  // Use dynamic row height for variable message sizes
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_MESSAGE_HEIGHT,
    key: messages.length, // Reset when messages change
  });
  
  // Pre-calculate which messages should show date
  const showDateForIndex = useMemo(() => {
    return messages.map((msg, idx) => {
      if (idx === 0) return true;
      return formatDate(messages[idx - 1].created_at) !== formatDate(msg.created_at);
    });
  }, [messages, formatDate]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      // Small delay to ensure list is rendered
      setTimeout(() => {
        listRef.current?.scrollToRow({ 
          index: messages.length - 1, 
          align: 'end',
          behavior: 'auto'
        });
      }, 50);
    }
  }, [messages.length, listRef]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Nenhuma mensagem
      </div>
    );
  }

  return (
    <List
      listRef={listRef}
      style={{ height, width: '100%' }}
      rowCount={messages.length}
      rowHeight={dynamicRowHeight}
      overscanCount={10}
      rowComponent={MessageRow}
      rowProps={{
        messages,
        formatTime,
        formatDate,
        showDateForIndex,
      }}
    />
  );
}

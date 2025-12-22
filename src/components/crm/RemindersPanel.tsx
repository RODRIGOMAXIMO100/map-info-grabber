import { useState, useMemo } from 'react';
import { format, isToday, isTomorrow, isPast, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, ChevronDown, ChevronUp, AlertTriangle, Clock, CalendarDays, MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { WhatsAppConversation } from '@/types/whatsapp';

interface RemindersPanelProps {
  conversations: WhatsAppConversation[];
  onLeadClick: (lead: WhatsAppConversation) => void;
  onRemoveReminder: (lead: WhatsAppConversation) => void;
}

export function RemindersPanel({ conversations, onLeadClick, onRemoveReminder }: RemindersPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const reminders = useMemo(() => {
    const withReminders = conversations.filter(c => c.reminder_at);
    
    const overdue: WhatsAppConversation[] = [];
    const today: WhatsAppConversation[] = [];
    const upcoming: WhatsAppConversation[] = [];

    withReminders.forEach(conv => {
      const reminderDate = new Date(conv.reminder_at!);
      
      if (isPast(reminderDate) && !isToday(reminderDate)) {
        overdue.push(conv);
      } else if (isToday(reminderDate)) {
        if (isPast(reminderDate)) {
          overdue.push(conv);
        } else {
          today.push(conv);
        }
      } else if (isTomorrow(reminderDate)) {
        upcoming.push(conv);
      } else {
        upcoming.push(conv);
      }
    });

    // Sort each group by reminder time
    const sortByReminder = (a: WhatsAppConversation, b: WhatsAppConversation) => 
      new Date(a.reminder_at!).getTime() - new Date(b.reminder_at!).getTime();

    return {
      overdue: overdue.sort(sortByReminder),
      today: today.sort(sortByReminder),
      upcoming: upcoming.sort(sortByReminder).slice(0, 5), // Only show next 5 upcoming
      total: withReminders.length,
    };
  }, [conversations]);

  if (reminders.total === 0) return null;

  const formatReminderTime = (date: Date) => {
    if (isToday(date)) {
      return `Hoje às ${format(date, 'HH:mm')}`;
    }
    if (isTomorrow(date)) {
      return `Amanhã às ${format(date, 'HH:mm')}`;
    }
    return format(date, "dd/MM 'às' HH:mm", { locale: ptBR });
  };

  const getTimeUntil = (date: Date) => {
    const mins = differenceInMinutes(date, new Date());
    if (mins < 0) return 'Vencido';
    if (mins < 60) return `em ${mins}min`;
    if (mins < 1440) return `em ${Math.floor(mins / 60)}h`;
    return `em ${Math.floor(mins / 1440)}d`;
  };

  return (
    <div className="border rounded-lg bg-card">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Lembretes</span>
          {reminders.overdue.length > 0 && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              {reminders.overdue.length} vencido{reminders.overdue.length > 1 ? 's' : ''}
            </Badge>
          )}
          {reminders.today.length > 0 && (
            <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500">
              {reminders.today.length} hoje
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {reminders.total} total
          </Badge>
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t p-3 space-y-3">
          {/* Overdue Section */}
          {reminders.overdue.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Vencidos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {reminders.overdue.map((conv) => (
                  <ReminderCard
                    key={conv.id}
                    conv={conv}
                    variant="overdue"
                    onClick={() => onLeadClick(conv)}
                    onRemove={() => onRemoveReminder(conv)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Today Section */}
          {reminders.today.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-yellow-600">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Hoje</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {reminders.today.map((conv) => (
                  <ReminderCard
                    key={conv.id}
                    conv={conv}
                    variant="today"
                    onClick={() => onLeadClick(conv)}
                    onRemove={() => onRemoveReminder(conv)}
                    timeLabel={getTimeUntil(new Date(conv.reminder_at!))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {reminders.upcoming.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">Próximos</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {reminders.upcoming.map((conv) => (
                  <ReminderCard
                    key={conv.id}
                    conv={conv}
                    variant="upcoming"
                    onClick={() => onLeadClick(conv)}
                    onRemove={() => onRemoveReminder(conv)}
                    timeLabel={formatReminderTime(new Date(conv.reminder_at!))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ReminderCardProps {
  conv: WhatsAppConversation;
  variant: 'overdue' | 'today' | 'upcoming';
  onClick: () => void;
  onRemove: () => void;
  timeLabel?: string;
}

function ReminderCard({ conv, variant, onClick, onRemove, timeLabel }: ReminderCardProps) {
  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-all group',
        variant === 'overdue' && 'border-destructive/50 bg-destructive/5 hover:bg-destructive/10',
        variant === 'today' && 'border-yellow-500/50 bg-yellow-500/5 hover:bg-yellow-500/10',
        variant === 'upcoming' && 'border-muted hover:bg-muted/50'
      )}
    >
      <div className="flex-1 min-w-0" onClick={onClick}>
        <p className="text-sm font-medium truncate">
          {conv.name || formatPhone(conv.phone)}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {timeLabel || format(new Date(conv.reminder_at!), "dd/MM HH:mm")}
        </p>
      </div>
      
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X className="h-3 w-3" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={onClick}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isTomorrow, isPast, isThisWeek, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  Bell, 
  Clock, 
  MessageSquare, 
  AlertTriangle, 
  Calendar,
  Check,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeRefresh } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useReminderNotifications } from '@/hooks/useReminderNotifications';
import type { WhatsAppConversation } from '@/types/whatsapp';

type ReminderGroup = {
  label: string;
  icon: React.ReactNode;
  variant: 'destructive' | 'default' | 'secondary' | 'outline';
  className?: string;
  reminders: WhatsAppConversation[];
};

export default function Reminders() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loading, setLoading] = useState(true);

  // Enable notifications - filter by user for non-admins
  useReminderNotifications({
    conversations,
    userId: user?.id,
    isAdmin,
    onReminderTriggered: (conv) => {
      navigate(`/whatsapp/chat?lead=${conv.id}`);
    },
  });

  useEffect(() => {
    loadReminders();
  }, []);

  // Centralized realtime subscription
  useRealtimeRefresh('whatsapp_conversations', useCallback(() => {
    loadReminders();
  }, []));

  const loadReminders = async () => {
    try {
      let query = supabase
        .from('whatsapp_conversations')
        .select('*')
        .not('reminder_at', 'is', null)
        .order('reminder_at', { ascending: true });

      // Non-admins see reminders they created OR where creator is null but assigned to them
      if (!isAdmin && user?.id) {
        query = query.or(`reminder_created_by.eq.${user.id},and(reminder_created_by.is.null,assigned_to.eq.${user.id})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDone = async (conv: WhatsAppConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          reminder_at: null, 
          reminder_created_by: null, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', conv.id);

      toast({ title: 'Lembrete concluído' });
      loadReminders();
    } catch (error) {
      console.error('Error marking done:', error);
      toast({ title: 'Erro ao concluir lembrete', variant: 'destructive' });
    }
  };

  const handleOpenChat = (conv: WhatsAppConversation) => {
    navigate(`/whatsapp/chat?lead=${conv.id}`);
  };

  const reminderGroups = useMemo((): ReminderGroup[] => {
    const now = new Date();
    const groups: ReminderGroup[] = [
      {
        label: 'Vencidos',
        icon: <AlertTriangle className="h-4 w-4" />,
        variant: 'destructive',
        reminders: conversations.filter(c => c.reminder_at && isPast(new Date(c.reminder_at)) && !isToday(new Date(c.reminder_at))),
      },
      {
        label: 'Hoje',
        icon: <Clock className="h-4 w-4" />,
        variant: 'outline',
        className: 'border-yellow-500 text-yellow-600 bg-yellow-50',
        reminders: conversations.filter(c => c.reminder_at && isToday(new Date(c.reminder_at))),
      },
      {
        label: 'Amanhã',
        icon: <Calendar className="h-4 w-4" />,
        variant: 'default',
        reminders: conversations.filter(c => c.reminder_at && isTomorrow(new Date(c.reminder_at))),
      },
      {
        label: 'Esta Semana',
        icon: <Calendar className="h-4 w-4" />,
        variant: 'secondary',
        reminders: conversations.filter(c => {
          if (!c.reminder_at) return false;
          const date = new Date(c.reminder_at);
          return isThisWeek(date) && !isToday(date) && !isTomorrow(date) && !isPast(date);
        }),
      },
      {
        label: 'Próximos',
        icon: <Calendar className="h-4 w-4" />,
        variant: 'secondary',
        reminders: conversations.filter(c => {
          if (!c.reminder_at) return false;
          const date = new Date(c.reminder_at);
          return date > addDays(now, 7);
        }),
      },
    ];

    return groups.filter(g => g.reminders.length > 0);
  }, [conversations]);

  const totalReminders = conversations.length;
  const overdueCount = reminderGroups.find(g => g.label === 'Vencidos')?.reminders.length || 0;
  const todayCount = reminderGroups.find(g => g.label === 'Hoje')?.reminders.length || 0;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-background">
      {/* Header */}
      <div className="border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Agenda de Lembretes</h1>
              <p className="text-sm text-muted-foreground">
                {totalReminders} lembrete{totalReminders !== 1 ? 's' : ''} agendado{totalReminders !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={loadReminders} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card className={cn("border-l-4", overdueCount > 0 ? "border-l-destructive" : "border-l-muted")}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Vencidos</p>
                <p className={cn("text-2xl font-bold", overdueCount > 0 && "text-destructive")}>{overdueCount}</p>
              </div>
              <AlertTriangle className={cn("h-5 w-5", overdueCount > 0 ? "text-destructive" : "text-muted-foreground")} />
            </CardContent>
          </Card>
          <Card className={cn("border-l-4", todayCount > 0 ? "border-l-yellow-500" : "border-l-muted")}>
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Hoje</p>
                <p className={cn("text-2xl font-bold", todayCount > 0 && "text-yellow-600")}>{todayCount}</p>
              </div>
              <Clock className={cn("h-5 w-5", todayCount > 0 ? "text-yellow-500" : "text-muted-foreground")} />
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-muted">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{totalReminders}</p>
              </div>
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reminders List */}
      <ScrollArea className="flex-1 p-4">
        {reminderGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Bell className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Nenhum lembrete agendado</p>
            <p className="text-sm">Agende lembretes nos leads do CRM</p>
          </div>
        ) : (
          <div className="space-y-6">
            {reminderGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={group.variant} className={cn("gap-1", group.className)}>
                    {group.icon}
                    {group.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    ({group.reminders.length})
                  </span>
                </div>

                <div className="space-y-2">
                  {group.reminders.map((conv) => (
                    <Card
                      key={conv.id}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                        group.variant === 'destructive' && "border-destructive/30 bg-destructive/5",
                        group.label === 'Hoje' && "border-yellow-500/30 bg-yellow-500/5"
                      )}
                      onClick={() => handleOpenChat(conv)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={conv.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {(conv.name || conv.phone).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">
                                {conv.name || conv.phone}
                              </span>
                              {conv.estimated_value && (
                                <Badge variant="outline" className="text-xs text-green-600">
                                  R$ {conv.estimated_value.toLocaleString('pt-BR')}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                {format(new Date(conv.reminder_at!), "dd/MM 'às' HH:mm", { locale: ptBR })}
                              </span>
                              {conv.last_message_preview && (
                                <>
                                  <span>•</span>
                                  <MessageSquare className="h-3 w-3" />
                                  <span className="truncate max-w-[200px]">
                                    {conv.last_message_preview}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100"
                              onClick={(e) => handleMarkDone(conv, e)}
                              title="Marcar como feito"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone,
  MessageCircle,
  Bell, 
  BellRing,
  Clock, 
  MoreVertical,
  Tag,
  DollarSign,
  Shuffle,
  ArrowRight,
  MapPin,
  Megaphone,
  Undo2,
  Pencil,
  Trash2,
  UserCheck,
  UserPlus,
  PhoneOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import type { CRMFunnelStage } from '@/types/crm';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/phone';
import type { WhatsAppConversation } from '@/types/whatsapp';
import { format, isPast, isToday, isTomorrow } from 'date-fns';

interface UtmData {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
}

interface LeadCardProps {
  conv: WhatsAppConversation & { 
    contacted_by_instances?: string[] | null;
    closed_value?: number | null;
    utm_data?: UtmData | null;
    phone_invalid?: boolean;
  };
  isDragging?: boolean;
  onDragStart: () => void;
  onClick: () => void;
  onSetReminder: () => void;
  onAddTag: () => void;
  onSetValue: () => void;
  onUndoSale?: () => void;
  onEditClosedValue?: () => void;
  onRemoveClosedValue?: () => void;
  onAssignUser?: () => void;
  onAssignToMe?: () => void;
  assignedUserName?: string | null;
  bantScore?: { budget?: boolean; authority?: boolean; need?: boolean; timing?: boolean } | null;
  stages?: CRMFunnelStage[];
  onStageChange?: (stageId: string) => void;
}

function LeadCardComponent({
  conv,
  isDragging,
  onDragStart,
  onClick,
  onSetReminder,
  onAddTag,
  onSetValue,
  onUndoSale,
  onEditClosedValue,
  onRemoveClosedValue,
  onAssignUser,
  onAssignToMe,
  assignedUserName,
  bantScore,
  stages,
  onStageChange,
}: LeadCardProps) {
  const navigate = useNavigate();

  const handleChatClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/whatsapp/chat?phone=${encodeURIComponent(conv.phone)}`);
  }, [navigate, conv.phone]);

  const handlePhoneClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`tel:${conv.phone}`, '_self');
  }, [conv.phone]);

  const handleReminderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSetReminder();
  }, [onSetReminder]);


  const formatTime = (date: string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  const getUrgencyColor = (lastMessageAt: string | null): string => {
    if (!lastMessageAt) return 'border-l-muted';
    const hours = (Date.now() - new Date(lastMessageAt).getTime()) / 3600000;
    if (hours < 1) return 'border-l-green-500';
    if (hours < 4) return 'border-l-yellow-500';
    if (hours < 24) return 'border-l-orange-500';
    return 'border-l-red-500';
  };

  const getNextActionBadge = () => {
    if (!conv.last_message_at) return null;
    
    const hours = (Date.now() - new Date(conv.last_message_at).getTime()) / 3600000;
    
    if (hours < 1) {
      return (
        <Badge variant="outline" className="text-[9px] h-4 px-1 border-green-400 text-green-600 bg-green-50 dark:bg-green-950/30">
          🟢 Quente
        </Badge>
      );
    }
    
    if (hours < 24) {
      return (
        <Badge variant="outline" className="text-[9px] h-4 px-1 border-yellow-400 text-yellow-600 bg-yellow-50 dark:bg-yellow-950/30">
          🟡 Follow-up
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-400 text-red-600 bg-red-50 dark:bg-red-950/30">
        🔴 Reativar
      </Badge>
    );
  };

  const BANTIndicator = () => {
    if (!bantScore) return null;
    
    const count = [
      bantScore.budget,
      bantScore.authority,
      bantScore.need,
      bantScore.timing
    ].filter(Boolean).length;

    return (
      <div className="flex items-center gap-0.5" title={`BANT: ${count}/4`}>
        {[0, 1, 2, 3].map((i) => {
          const values = [bantScore.budget, bantScore.authority, bantScore.need, bantScore.timing];
          const value = values[i];
          return (
            <span
              key={i}
              className={cn(
                "w-2 h-2 rounded-full",
                value === true && "bg-green-500",
                value === false && "bg-red-500",
                value === undefined && "bg-muted"
              )}
            />
          );
        })}
      </div>
    );
  };

  // Reminder status helpers
  const reminderDate = conv.reminder_at ? new Date(conv.reminder_at) : null;
  const hasReminder = !!reminderDate;
  const isOverdue = reminderDate ? isPast(reminderDate) : false;
  const isTodayReminder = reminderDate ? isToday(reminderDate) : false;
  
  const formatReminderLabel = () => {
    if (!reminderDate) return 'Agendar lembrete';
    if (isToday(reminderDate)) return `Hoje ${format(reminderDate, 'HH:mm')}`;
    if (isTomorrow(reminderDate)) return `Amanhã ${format(reminderDate, 'HH:mm')}`;
    return format(reminderDate, "dd/MM HH:mm");
  };

  const getReminderButtonStyle = () => {
    if (!hasReminder) return 'text-muted-foreground hover:text-foreground';
    if (isOverdue) return 'text-amber-500 animate-pulse';
    if (isTodayReminder) return 'text-primary';
    return 'text-primary/70';
  };

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        'cursor-pointer hover:shadow-md transition-all border-l-4 relative group',
        getUrgencyColor(conv.last_message_at),
        isDragging && 'opacity-50 ring-2 ring-primary',
        isOverdue && 'ring-2 ring-yellow-500/50'
      )}
    >
      <CardContent className="p-2.5 overflow-visible">
        {/* Row 1: Name + Actions */}
        <div className="flex items-center gap-1">
          <span className="font-medium text-sm truncate min-w-0 flex-1" style={{ maxWidth: '120px' }}>
            {conv.name || formatPhoneNumber(conv.phone)}
          </span>
          <div className="flex items-center gap-0.5 ml-auto">
            <BANTIndicator />
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 hover:bg-green-100 dark:hover:bg-green-900/50"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/whatsapp/chat?phone=${encodeURIComponent(conv.phone)}`);
              }}
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost" 
              className="h-6 w-6 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              onClick={(e) => {
                e.stopPropagation();
                window.open(`tel:${conv.phone}`, '_self');
              }}
            >
              <Phone className="h-3.5 w-3.5 text-blue-600" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn("h-6 w-6", getReminderButtonStyle())}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetReminder();
                    }}
                  >
                    {isOverdue ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {formatReminderLabel()}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover">
                {stages && stages.length > 0 && onStageChange && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger onClick={(e) => e.stopPropagation()}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Mover para etapa
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="bg-popover">
                      {stages.map((stage) => (
                        <DropdownMenuItem
                          key={stage.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onStageChange(stage.id);
                          }}
                          disabled={stage.id === conv.funnel_stage}
                          className="gap-2"
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: stage.color || '#888' }}
                          />
                          {stage.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {!conv.assigned_to && onAssignToMe && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssignToMe(); }}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assumir para mim
                  </DropdownMenuItem>
                )}
                {onAssignUser && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAssignUser(); }}>
                    <UserCheck className="h-4 w-4 mr-2" />
                    {conv.assigned_to ? 'Transferir lead' : 'Atribuir vendedor'}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAddTag(); }}>
                  <Tag className="h-4 w-4 mr-2" />
                  Adicionar tag
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSetValue(); }}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Definir valor
                </DropdownMenuItem>
                {/* Show Won stage specific options */}
                {(() => {
                  const currentStage = stages?.find(s => s.id === conv.funnel_stage);
                  const isWonStage = currentStage && (
                    currentStage.name.toLowerCase().includes('fechado') ||
                    currentStage.name.toLowerCase().includes('ganho') ||
                    currentStage.name.toLowerCase().includes('won')
                  );
                  
                  if (!isWonStage) return null;
                  
                  return (
                    <>
                      {onEditClosedValue && (
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); onEditClosedValue(); }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar valor fechado
                        </DropdownMenuItem>
                      )}
                      {onRemoveClosedValue && conv.closed_value !== null && conv.closed_value !== undefined && (
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); onRemoveClosedValue(); }}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remover valor fechado
                        </DropdownMenuItem>
                      )}
                      {onUndoSale && (
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); onUndoSale(); }}
                          className="text-amber-600"
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          Desfazer venda
                        </DropdownMenuItem>
                      )}
                    </>
                  );
                })()}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Row 2: Phone + Value */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span className="truncate">📱 {formatPhoneNumber(conv.phone)}</span>
          {(conv.closed_value || conv.estimated_value) && (
            <span className={cn(
              "font-medium",
              conv.closed_value ? "text-green-600" : "text-muted-foreground"
            )}>
              {conv.closed_value ? '✅ ' : ''}
              R$ {Number(conv.closed_value || conv.estimated_value).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        {/* Row 2.5: Origin (City + Broadcast + UTM) */}
        {(conv.lead_city || conv.broadcast_lists?.name || conv.utm_data?.utm_source) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 gap-1">
            {conv.lead_city && (
              <span className="truncate flex items-center gap-1 min-w-0">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {conv.lead_city}{conv.lead_state ? `/${conv.lead_state}` : ''}
              </span>
            )}
            <div className="flex items-center gap-1 flex-shrink-0">
              {conv.utm_data?.utm_source && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 gap-0.5 border-blue-400 text-blue-600 bg-blue-50 dark:bg-blue-950/30">
                        🔗 {conv.utm_data.utm_source}
                        {conv.utm_data.utm_medium && `/${conv.utm_data.utm_medium}`}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-1">
                        {conv.utm_data.utm_source && <div>Source: {conv.utm_data.utm_source}</div>}
                        {conv.utm_data.utm_medium && <div>Medium: {conv.utm_data.utm_medium}</div>}
                        {conv.utm_data.utm_campaign && <div>Campaign: {conv.utm_data.utm_campaign}</div>}
                        {conv.utm_data.utm_term && <div>Term: {conv.utm_data.utm_term}</div>}
                        {conv.utm_data.utm_content && <div>Content: {conv.utm_data.utm_content}</div>}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {conv.broadcast_lists?.name && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 flex-shrink-0 gap-0.5">
                  <Megaphone className="h-2.5 w-2.5" />
                  {conv.broadcast_lists.name}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Row 3: Assigned User + Status badges */}
        <div className="flex items-center justify-between mt-1.5 gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            {assignedUserName && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      variant="outline" 
                      className="text-[9px] h-4 px-1 border-purple-400 text-purple-600 bg-purple-50 dark:bg-purple-950/30 gap-0.5 max-w-[80px] truncate"
                    >
                      <UserCheck className="h-2.5 w-2.5 flex-shrink-0" />
                      {assignedUserName}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Atribuído para {assignedUserName}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Phone Invalid Indicator */}
            {conv.phone_invalid && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="destructive" className="text-[9px] h-4 px-1 gap-0.5">
                      <PhoneOff className="h-2.5 w-2.5" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Número não está no WhatsApp
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Badge 
              variant={conv.ai_paused ? "outline" : "secondary"} 
              className="text-[9px] h-4 px-1"
            >
              {conv.ai_paused ? '👤' : '🤖'}
            </Badge>
            {(conv.unread_count ?? 0) > 0 && (
              <Badge className="text-[9px] h-4 px-1 bg-red-500 text-white">
                {conv.unread_count}
              </Badge>
            )}
            {getNextActionBadge()}
            {conv.contacted_by_instances && conv.contacted_by_instances.length > 1 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/30 gap-0.5">
                      <Shuffle className="h-2.5 w-2.5" />
                      {conv.contacted_by_instances.length}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Contatado por {conv.contacted_by_instances.length} números diferentes
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            <Clock className="h-3 w-3 inline mr-0.5" />
            {formatTime(conv.last_message_at)}
          </span>
        </div>

        {/* Row 4: Custom Tags */}
        {conv.custom_tags && conv.custom_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {conv.custom_tags.slice(0, 3).map((tag, i) => (
              <Badge key={i} variant="outline" className="text-[9px] h-4 px-1">
                {tag}
              </Badge>
            ))}
            {conv.custom_tags.length > 3 && (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                +{conv.custom_tags.length - 3}
              </Badge>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

// Memoized export with custom comparison
export const LeadCard = memo(LeadCardComponent, (prevProps, nextProps) => {
  // Only re-render if essential data changes
  return (
    prevProps.conv.id === nextProps.conv.id &&
    prevProps.conv.name === nextProps.conv.name &&
    prevProps.conv.phone === nextProps.conv.phone &&
    prevProps.conv.ai_paused === nextProps.conv.ai_paused &&
    prevProps.conv.unread_count === nextProps.conv.unread_count &&
    prevProps.conv.last_message_at === nextProps.conv.last_message_at &&
    prevProps.conv.estimated_value === nextProps.conv.estimated_value &&
    prevProps.conv.closed_value === nextProps.conv.closed_value &&
    prevProps.conv.funnel_stage === nextProps.conv.funnel_stage &&
    prevProps.conv.reminder_at === nextProps.conv.reminder_at &&
    prevProps.conv.phone_invalid === nextProps.conv.phone_invalid &&
    prevProps.conv.custom_tags?.length === nextProps.conv.custom_tags?.length &&
    prevProps.isDragging === nextProps.isDragging &&
    prevProps.assignedUserName === nextProps.assignedUserName &&
    JSON.stringify(prevProps.bantScore) === JSON.stringify(nextProps.bantScore)
  );
});
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { LeadCard } from './LeadCard';
import type { WhatsAppConversation } from '@/types/whatsapp';
import type { CRMFunnelStage } from '@/types/crm';

interface BANTScore {
  budget?: boolean;
  authority?: boolean;
  need?: boolean;
  timing?: boolean;
}

interface MobileKanbanViewProps {
  stages: CRMFunnelStage[];
  filteredConversations: WhatsAppConversation[];
  unclassified: WhatsAppConversation[];
  bantScores: Record<string, BANTScore>;
  assignedUserNames: Record<string, string>;
  onLeadClick: (conv: WhatsAppConversation) => void;
  onSetReminder: (conv: WhatsAppConversation) => void;
  onAddTag: (conv: WhatsAppConversation) => void;
  onSetValue: (conv: WhatsAppConversation) => void;
  onUndoSale: (conv: WhatsAppConversation) => void;
  onEditClosedValue: (conv: WhatsAppConversation) => void;
  onRemoveClosedValue: (conv: WhatsAppConversation) => void;
  onAssignUser: (conv: WhatsAppConversation) => void;
  onAssignToMe: (convId: string) => void;
  onStageChange: (convId: string, stageId: string) => void;
}

export function MobileKanbanView({
  stages,
  filteredConversations,
  unclassified,
  bantScores,
  assignedUserNames,
  onLeadClick,
  onSetReminder,
  onAddTag,
  onSetValue,
  onUndoSale,
  onEditClosedValue,
  onRemoveClosedValue,
  onAssignUser,
  onAssignToMe,
  onStageChange,
}: MobileKanbanViewProps) {
  const getConversationsForStage = (stage: CRMFunnelStage) => {
    return filteredConversations.filter(conv => conv.funnel_stage === stage.id);
  };

  // Create tabs array - include unclassified only if there are items
  const tabs = [
    ...(unclassified.length > 0 ? [{ id: 'unclassified', name: 'Não Class.', color: '#888', conversations: unclassified }] : []),
    ...stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      conversations: getConversationsForStage(stage),
    })),
  ];

  const defaultTab = tabs[0]?.id || '';

  return (
    <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col overflow-hidden">
      {/* Compact horizontal scrollable tabs */}
      <div className="flex-shrink-0 border-b bg-muted/30 overflow-x-auto">
        <TabsList className="inline-flex h-11 p-1 bg-transparent gap-1.5 w-max">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm whitespace-nowrap rounded-md shrink-0"
              style={{ touchAction: 'manipulation' }}
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: tab.color || '#888' }}
              />
              <span className="whitespace-nowrap">{tab.name}</span>
              <Badge variant="secondary" className="h-4 min-w-[18px] px-1 text-[10px] shrink-0">
                {tab.conversations.length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          className="flex-1 m-0 overflow-hidden data-[state=inactive]:hidden"
        >
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1.5">
              {tab.conversations.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  Nenhum lead nesta etapa
                </div>
              ) : (
                tab.conversations.map((conv) => (
                  <LeadCard
                    key={conv.id}
                    conv={conv}
                    onDragStart={() => {}}
                    onClick={() => onLeadClick(conv)}
                    onSetReminder={() => onSetReminder(conv)}
                    onAddTag={() => onAddTag(conv)}
                    onSetValue={() => onSetValue(conv)}
                    onUndoSale={() => onUndoSale(conv)}
                    onEditClosedValue={() => onEditClosedValue(conv)}
                    onRemoveClosedValue={() => onRemoveClosedValue(conv)}
                    onAssignUser={() => onAssignUser(conv)}
                    onAssignToMe={() => onAssignToMe(conv.id)}
                    assignedUserName={conv.assigned_to ? assignedUserNames[conv.assigned_to] : null}
                    bantScore={bantScores[conv.id]}
                    stages={stages}
                    onStageChange={(stageId) => onStageChange(conv.id, stageId)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      ))}
    </Tabs>
  );
}

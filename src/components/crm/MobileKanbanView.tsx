import { useState } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react';
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
    ...(unclassified.length > 0 ? [{ id: 'unclassified', name: 'Não Classificado', color: '#888', conversations: unclassified }] : []),
    ...stages.map(stage => ({
      id: stage.id,
      name: stage.name,
      color: stage.color,
      conversations: getConversationsForStage(stage),
    })),
  ];

  const defaultTab = tabs[0]?.id || '';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentTabIndex = tabs.findIndex(t => t.id === activeTab);
  const currentTab = tabs[currentTabIndex] || tabs[0];

  const goToPrevStage = () => {
    if (currentTabIndex > 0) {
      setActiveTab(tabs[currentTabIndex - 1].id);
    }
  };

  const goToNextStage = () => {
    if (currentTabIndex < tabs.length - 1) {
      setActiveTab(tabs[currentTabIndex + 1].id);
    }
  };

  const handleSelectStage = (tabId: string) => {
    setActiveTab(tabId);
    setDrawerOpen(false);
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
      {/* Stage Picker Bar */}
      <div className="flex-shrink-0 border-b bg-background px-2 py-1.5 flex items-center gap-1">
        {/* Previous Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={goToPrevStage}
          disabled={currentTabIndex <= 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Current Stage Button - Opens Drawer */}
        <Button
          variant="outline"
          className="flex-1 h-9 justify-between gap-2 px-3"
          onClick={() => setDrawerOpen(true)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: currentTab?.color || '#888' }}
            />
            <span className="truncate font-medium text-sm">
              {currentTab?.name || 'Selecionar'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-xs">
              {currentTab?.conversations.length || 0}
            </Badge>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>

        {/* Next Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={goToNextStage}
          disabled={currentTabIndex >= tabs.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Stage Selection Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[70vh]">
          <DrawerHeader className="border-b pb-3">
            <DrawerTitle>Selecionar Etapa</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="flex-1 p-2">
            <div className="space-y-1">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={tab.id === activeTab ? 'secondary' : 'ghost'}
                  className="w-full justify-between h-12 px-3"
                  onClick={() => handleSelectStage(tab.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: tab.color || '#888' }}
                    />
                    <span className="truncate text-sm font-medium">
                      {tab.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="h-6 min-w-[24px] px-2 text-xs">
                      {tab.conversations.length}
                    </Badge>
                    {tab.id === activeTab && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>

      {/* Tab Contents */}
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

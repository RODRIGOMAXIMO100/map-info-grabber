import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  Bell, 
  Bot, 
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { AlertsData, AlertItem } from "@/hooks/useDashboardData";

interface ActionAlertsProps {
  data: AlertsData;
  loading?: boolean;
}

type AlertTab = 'critical' | 'handoffs' | 'reminders';

export default function ActionAlerts({ data, loading = false }: ActionAlertsProps) {
  const [activeTab, setActiveTab] = useState<AlertTab>('critical');
  const navigate = useNavigate();

  const handleLeadClick = (leadId: string) => {
    navigate(`/whatsapp?conversation=${leadId}`);
  };

  const totalAlerts = data.critical.length + data.handoffs.length + data.reminders.length;

  const getTabIcon = (tab: AlertTab) => {
    switch (tab) {
      case 'critical': return <AlertTriangle className="h-4 w-4" />;
      case 'handoffs': return <Bot className="h-4 w-4" />;
      case 'reminders': return <Bell className="h-4 w-4" />;
    }
  };

  const renderAlertList = (items: AlertItem[]) => {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mb-2 text-green-500" />
          <p className="text-sm font-medium">Tudo em dia!</p>
          <p className="text-xs">Nenhum alerta pendente</p>
        </div>
      );
    }

    return (
      <ScrollArea className="h-[300px]">
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors group"
              onClick={() => handleLeadClick(item.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {item.name || item.phone}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {item.detail}
                </p>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Ações Pendentes
          </CardTitle>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="text-sm px-2.5 py-0.5">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AlertTab)}>
          <TabsList className="w-full grid grid-cols-3 mb-4">
            <TabsTrigger value="critical" className="gap-1.5 text-xs">
              {getTabIcon('critical')}
              Críticos
              {data.critical.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {data.critical.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="handoffs" className="gap-1.5 text-xs">
              {getTabIcon('handoffs')}
              Handoffs
              {data.handoffs.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {data.handoffs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1.5 text-xs">
              {getTabIcon('reminders')}
              Lembretes
              {data.reminders.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {data.reminders.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="critical" className="mt-0">
            {renderAlertList(data.critical)}
          </TabsContent>
          
          <TabsContent value="handoffs" className="mt-0">
            {renderAlertList(data.handoffs)}
          </TabsContent>
          
          <TabsContent value="reminders" className="mt-0">
            {renderAlertList(data.reminders)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

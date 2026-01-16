import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  AlertTriangle, 
  Clock, 
  Bell, 
  Bot, 
  DollarSign,
  ExternalLink,
  CheckCircle2
} from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface AlertItem {
  id: string;
  name: string | null;
  phone: string;
  detail: string;
  priority: number;
  timestamp?: string;
}

interface ActionAlertsProps {
  funnelId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

type AlertTab = 'critical' | 'handoffs' | 'reminders';

export default function ActionAlerts({ funnelId, startDate, endDate }: ActionAlertsProps) {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AlertTab>('critical');
  const [alerts, setAlerts] = useState<{
    critical: AlertItem[];
    handoffs: AlertItem[];
    reminders: AlertItem[];
  }>({
    critical: [],
    handoffs: [],
    reminders: [],
  });
  const navigate = useNavigate();

  useEffect(() => {
    loadAllAlerts();
  }, [funnelId, startDate, endDate]);

  const buildQuery = (query: any) => {
    if (startDate) {
      query = query.gte('created_at', startDate.toISOString());
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString());
    }
    return query;
  };

  const loadAllAlerts = async () => {
    try {
      setLoading(true);
      const now = new Date();

      // 1. Critical leads (cold > 48h + high value stalled + AI paused)
      const criticalAlerts: AlertItem[] = [];

      // Cold leads
      const coldThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      let coldQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, last_lead_message_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .not('last_lead_message_at', 'is', null)
        .lt('last_lead_message_at', coldThreshold.toISOString())
        .order('last_lead_message_at', { ascending: true })
        .limit(5);
      
      coldQuery = buildQuery(coldQuery);
      const { data: coldLeads } = await coldQuery;

      (coldLeads || []).forEach(lead => {
        const hours = differenceInHours(now, new Date(lead.last_lead_message_at!));
        criticalAlerts.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          detail: `❄️ Sem resposta há ${Math.floor(hours / 24)}d ${hours % 24}h`,
          priority: 1,
        });
      });

      // High value stalled
      const stalledThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      let highValueQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, estimated_value, funnel_stage_changed_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .gt('estimated_value', 1000)
        .lt('funnel_stage_changed_at', stalledThreshold.toISOString())
        .order('estimated_value', { ascending: false })
        .limit(5);

      highValueQuery = buildQuery(highValueQuery);
      const { data: highValueLeads } = await highValueQuery;

      (highValueLeads || []).forEach(lead => {
        const days = Math.floor(differenceInHours(now, new Date(lead.funnel_stage_changed_at!)) / 24);
        criticalAlerts.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          detail: `💰 R$ ${Number(lead.estimated_value).toLocaleString('pt-BR')} parado há ${days}d`,
          priority: 2,
        });
      });

      // AI paused
      let aiPausedQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, ai_handoff_reason')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .eq('ai_paused', true)
        .order('last_message_at', { ascending: false })
        .limit(5);

      aiPausedQuery = buildQuery(aiPausedQuery);
      const { data: aiPausedLeads } = await aiPausedQuery;

      (aiPausedLeads || []).forEach(lead => {
        criticalAlerts.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          detail: `🤖 ${lead.ai_handoff_reason || 'IA pausada'}`,
          priority: 3,
        });
      });

      // 2. Handoffs pending
      const handoffStage = await supabase
        .from('crm_funnel_stages')
        .select('id')
        .eq('funnel_id', funnelId)
        .or('name.ilike.%handoff%,name.ilike.%atendimento%')
        .limit(1)
        .maybeSingle();

      let handoffsQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, ai_handoff_reason, last_message_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId);
      
      if (handoffStage.data?.id) {
        handoffsQuery = handoffsQuery.eq('funnel_stage', handoffStage.data.id);
      } else {
        handoffsQuery = handoffsQuery.eq('ai_paused', true);
      }
      
      handoffsQuery = handoffsQuery.order('last_message_at', { ascending: false }).limit(10);
      handoffsQuery = buildQuery(handoffsQuery);
      
      const { data: handoffLeads } = await handoffsQuery;

      const handoffAlerts: AlertItem[] = (handoffLeads || []).map(lead => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        detail: lead.ai_handoff_reason || 'Aguardando atendimento',
        priority: 1,
        timestamp: lead.last_message_at,
      }));

      // 3. Overdue reminders
      let reminderQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, reminder_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .not('reminder_at', 'is', null)
        .lt('reminder_at', now.toISOString())
        .order('reminder_at', { ascending: true })
        .limit(10);

      reminderQuery = buildQuery(reminderQuery);
      const { data: reminderLeads } = await reminderQuery;

      const reminderAlerts: AlertItem[] = (reminderLeads || []).map(lead => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        detail: `Vencido ${formatDistanceToNow(new Date(lead.reminder_at!), { addSuffix: true, locale: ptBR })}`,
        priority: 1,
        timestamp: lead.reminder_at,
      }));

      // Deduplicate critical alerts
      const uniqueCritical = criticalAlerts
        .filter((alert, index, self) => self.findIndex(a => a.id === alert.id) === index)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 10);

      setAlerts({
        critical: uniqueCritical,
        handoffs: handoffAlerts,
        reminders: reminderAlerts,
      });
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLeadClick = (leadId: string) => {
    navigate(`/whatsapp?conversation=${leadId}`);
  };

  const totalAlerts = alerts.critical.length + alerts.handoffs.length + alerts.reminders.length;

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
              {alerts.critical.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {alerts.critical.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="handoffs" className="gap-1.5 text-xs">
              {getTabIcon('handoffs')}
              Handoffs
              {alerts.handoffs.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {alerts.handoffs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1.5 text-xs">
              {getTabIcon('reminders')}
              Lembretes
              {alerts.reminders.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
                  {alerts.reminders.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="critical" className="mt-0">
            {renderAlertList(alerts.critical)}
          </TabsContent>
          
          <TabsContent value="handoffs" className="mt-0">
            {renderAlertList(alerts.handoffs)}
          </TabsContent>
          
          <TabsContent value="reminders" className="mt-0">
            {renderAlertList(alerts.reminders)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

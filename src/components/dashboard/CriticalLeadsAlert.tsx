import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Clock, DollarSign, Bot, Bell } from "lucide-react";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface CriticalLead {
  id: string;
  name: string | null;
  phone: string;
  type: 'cold' | 'reminder' | 'high_value' | 'ai_paused';
  detail: string;
  priority: number;
}

interface CriticalLeadsAlertProps {
  funnelId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export default function CriticalLeadsAlert({ funnelId, startDate, endDate }: CriticalLeadsAlertProps) {
  const [leads, setLeads] = useState<CriticalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadCriticalLeads();
  }, [funnelId, startDate, endDate]);

  const loadCriticalLeads = async () => {
    try {
      setLoading(true);
      const criticalLeads: CriticalLead[] = [];
      const now = new Date();

      // Base query builder with optional date filters
      const buildQuery = (query: any) => {
        if (startDate) {
          query = query.gte('last_message_at', startDate.toISOString());
        }
        if (endDate) {
          query = query.lte('last_message_at', endDate.toISOString());
        }
        return query;
      };

      // 1. Cold leads (no response > 48h)
      const coldThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
      let coldQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, last_lead_message_at, last_message_at')
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
        criticalLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          type: 'cold',
          detail: `Sem resposta há ${Math.floor(hours / 24)}d ${hours % 24}h`,
          priority: 1,
        });
      });

      // 2. Overdue reminders
      let reminderQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, reminder_at, last_message_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .not('reminder_at', 'is', null)
        .lt('reminder_at', now.toISOString())
        .order('reminder_at', { ascending: true })
        .limit(5);

      reminderQuery = buildQuery(reminderQuery);
      const { data: reminderLeads } = await reminderQuery;

      (reminderLeads || []).forEach(lead => {
        criticalLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          type: 'reminder',
          detail: `Lembrete vencido ${formatDistanceToNow(new Date(lead.reminder_at!), { addSuffix: true, locale: ptBR })}`,
          priority: 2,
        });
      });

      // 3. High value stalled leads (> R$ 1000, parado > 3 dias)
      const stalledThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      let highValueQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, estimated_value, funnel_stage_changed_at, last_message_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .gt('estimated_value', 1000)
        .lt('funnel_stage_changed_at', stalledThreshold.toISOString())
        .order('estimated_value', { ascending: false })
        .limit(5);

      highValueQuery = buildQuery(highValueQuery);
      const { data: highValueLeads } = await highValueQuery;

      (highValueLeads || []).forEach(lead => {
        criticalLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          type: 'high_value',
          detail: `R$ ${Number(lead.estimated_value).toLocaleString('pt-BR')} parado há ${Math.floor(differenceInHours(now, new Date(lead.funnel_stage_changed_at!)) / 24)} dias`,
          priority: 3,
        });
      });

      // 4. AI paused leads
      let aiPausedQuery = supabase
        .from('whatsapp_conversations')
        .select('id, name, phone, ai_handoff_reason, last_message_at')
        .eq('is_crm_lead', true)
        .eq('crm_funnel_id', funnelId)
        .eq('ai_paused', true)
        .order('last_message_at', { ascending: false })
        .limit(5);

      aiPausedQuery = buildQuery(aiPausedQuery);
      const { data: aiPausedLeads } = await aiPausedQuery;

      (aiPausedLeads || []).forEach(lead => {
        criticalLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          type: 'ai_paused',
          detail: lead.ai_handoff_reason || 'IA pausada, aguardando atendimento',
          priority: 4,
        });
      });

      // Sort by priority and deduplicate
      const uniqueLeads = criticalLeads
        .filter((lead, index, self) => self.findIndex(l => l.id === lead.id) === index)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, 10);

      setLeads(uniqueLeads);
    } catch (error) {
      console.error('Error loading critical leads:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: CriticalLead['type']) => {
    switch (type) {
      case 'cold': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'reminder': return <Bell className="h-4 w-4 text-orange-500" />;
      case 'high_value': return <DollarSign className="h-4 w-4 text-yellow-500" />;
      case 'ai_paused': return <Bot className="h-4 w-4 text-purple-500" />;
    }
  };

  const getTypeBadge = (type: CriticalLead['type']) => {
    switch (type) {
      case 'cold': return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">Frio</Badge>;
      case 'reminder': return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">Lembrete</Badge>;
      case 'high_value': return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 text-xs">Alto Valor</Badge>;
      case 'ai_paused': return <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 text-xs">IA Pausada</Badge>;
    }
  };

  const handleLeadClick = (leadId: string) => {
    navigate(`/whatsapp?conversation=${leadId}`);
  };

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Leads Críticos
          {leads.length > 0 && (
            <Badge variant="destructive" className="ml-auto">{leads.length}</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs">
          Precisam de atenção imediata
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mb-2 text-green-500" />
            <p className="text-sm">Nenhum alerta no momento</p>
            <p className="text-xs">Todos os leads estão em dia!</p>
          </div>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="space-y-2">
              {leads.map((lead) => (
                <div
                  key={`${lead.id}-${lead.type}`}
                  className="flex items-start gap-2 p-2 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleLeadClick(lead.id)}
                >
                  <div className="mt-0.5">
                    {getTypeIcon(lead.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium text-sm truncate">
                        {lead.name || lead.phone}
                      </span>
                      {getTypeBadge(lead.type)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {lead.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

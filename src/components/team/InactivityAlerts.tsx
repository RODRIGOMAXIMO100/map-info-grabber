import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, User, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface InactiveUser {
  user_id: string;
  full_name: string;
  last_activity: string | null;
  leads_pending: number;
}

interface PendingLead {
  id: string;
  name: string | null;
  phone: string;
  assigned_to_name: string;
  last_message_at: string | null;
}

interface InactivityAlertsProps {
  inactiveUsers: InactiveUser[];
  pendingLeads: PendingLead[];
  loading?: boolean;
}

export default function InactivityAlerts({ inactiveUsers, pendingLeads, loading }: InactivityAlertsProps) {
  if (loading) {
    return (
      <Card className="border-amber-500/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Alertas de Inatividade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            Carregando...
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = inactiveUsers.length > 0 || pendingLeads.length > 0;

  if (!hasAlerts) {
    return (
      <Card className="border-green-500/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2 text-green-600">
            <AlertTriangle className="h-5 w-5" />
            Alertas de Inatividade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            ✓ Nenhum alerta no momento
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatLastActivity = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  };

  return (
    <Card className="border-amber-500/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-5 w-5" />
          Alertas de Inatividade
          <Badge variant="destructive" className="ml-auto">
            {inactiveUsers.length + pendingLeads.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Usuários Inativos */}
        {inactiveUsers.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <User className="h-4 w-4" />
              Vendedores sem atividade hoje
            </h4>
            <div className="space-y-2">
              {inactiveUsers.map(user => (
                <div 
                  key={user.user_id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/20"
                >
                  <div>
                    <span className="font-medium text-sm">{user.full_name}</span>
                    <p className="text-xs text-muted-foreground">
                      Última atividade: {formatLastActivity(user.last_activity)}
                    </p>
                  </div>
                  {user.leads_pending > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {user.leads_pending} leads pendentes
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leads Pendentes */}
        {pendingLeads.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              Leads sem contato há 24h+
            </h4>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {pendingLeads.slice(0, 5).map(lead => (
                <div 
                  key={lead.id} 
                  className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                >
                  <div>
                    <span className="font-medium text-sm">{lead.name || lead.phone}</span>
                    <p className="text-xs text-muted-foreground">
                      Atribuído: {lead.assigned_to_name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="h-3 w-3" />
                    {formatLastActivity(lead.last_message_at)}
                  </div>
                </div>
              ))}
              {pendingLeads.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-1">
                  + {pendingLeads.length - 5} outros leads pendentes
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Wifi, 
  WifiOff, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle,
  Clock,
  Loader2,
  Info,
  Link,
  Link2Off,
  Wrench
} from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface InstanceStatus {
  configId: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  rawState: string | null;
  webhookStatus: 'configured' | 'misconfigured' | 'not_configured' | 'events_missing' | 'disabled' | 'error';
  webhookUrl: string | null;
  webhookEnabled: boolean | null;
  webhookEvents: string[];
  lastCheck: string | null;
  color: string;
}

interface InstanceStatusPanelProps {
  onStatusChange?: (hasDisconnected: boolean) => void;
}

export function InstanceStatusPanel({ onStatusChange }: InstanceStatusPanelProps) {
  const [instances, setInstances] = useState<InstanceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [fixingWebhook, setFixingWebhook] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      // Get all active configs
      const { data: configs } = await supabase
        .from('whatsapp_config')
        .select('id, name, color, is_active')
        .eq('is_active', true)
        .order('name');

      if (!configs || configs.length === 0) {
        setInstances([]);
        setLoading(false);
        return;
      }

      // Get latest status for each config
      const statusPromises = configs.map(async (config) => {
        const { data: status } = await supabase
          .from('whatsapp_instance_status')
          .select('status, details, checked_at')
          .eq('config_id', config.id)
          .order('checked_at', { ascending: false })
          .limit(1)
          .single();

        // Extract rawState and webhookStatus from details
        const details = status?.details as Record<string, unknown> | null;
        const rawState = details?.rawState as string | null;
        const webhookStatus = (details?.webhookStatus as 'configured' | 'misconfigured' | 'not_configured' | 'events_missing' | 'disabled' | 'error') || 'error';
        const webhookUrl = details?.webhookUrl as string | null;
        const webhookEnabled = details?.webhookEnabled as boolean | null ?? null;
        const webhookEvents = (details?.webhookEvents as string[]) || [];

        return {
          configId: config.id,
          name: config.name || 'Instância',
          status: (status?.status as 'connected' | 'disconnected' | 'connecting' | 'error') || 'error',
          rawState: rawState || null,
          webhookStatus,
          webhookUrl,
          webhookEnabled,
          webhookEvents,
          lastCheck: status?.checked_at || null,
          color: config.color || '#10B981',
        };
      });

      const results = await Promise.all(statusPromises);
      setInstances(results);

      // Notify parent about disconnected instances
      const hasDisconnected = results.some(i => i.status !== 'connected');
      onStatusChange?.(hasDisconnected);

    } catch (error) {
      console.error('Error loading instance status:', error);
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  const checkAllInstances = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-instance-status');
      
      if (error) throw error;

      if (data?.results) {
        const disconnected = data.results.filter((r: { status: string }) => r.status !== 'connected');
        if (disconnected.length > 0) {
          toast.warning(`${disconnected.length} instância(s) desconectada(s)`, {
            description: disconnected.map((d: { name: string; rawState?: string }) => 
              `${d.name}${d.rawState ? ` (${d.rawState})` : ''}`
            ).join(', '),
          });
        } else {
          toast.success('Todas as instâncias conectadas!');
        }
      }

      // Reload status
      await loadStatus();
    } catch (error) {
      console.error('Error checking instances:', error);
      toast.error('Erro ao verificar instâncias');
    } finally {
      setChecking(false);
    }
  };

  const fixWebhook = async (configId: string) => {
    setFixingWebhook(configId);
    try {
      const { error } = await supabase.functions.invoke('configure-webhook', {
        body: { instance_id: configId, action: 'configure' },
      });

      if (error) throw error;

      toast.success('Webhook configurado com sucesso!');
      
      // Reload status after fixing
      await loadStatus();
    } catch (err) {
      console.error('Error fixing webhook:', err);
      toast.error('Erro ao configurar webhook');
    } finally {
      setFixingWebhook(null);
    }
  };

  useEffect(() => {
    loadStatus();

    // Subscribe to status changes
    const channel = supabase
      .channel('instance-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_instance_status',
        },
        () => {
          loadStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStatus]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'connecting':
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'disconnected':
        return <WifiOff className="h-4 w-4 text-destructive" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string, rawState: string | null) => {
    const stateLabel = rawState ? ` (${rawState})` : '';
    
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Conectado{stateLabel}</Badge>;
      case 'connecting':
        return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30">Conectando{stateLabel}</Badge>;
      case 'disconnected':
        return <Badge variant="destructive">Desconectado{stateLabel}</Badge>;
      default:
        return <Badge variant="secondary">Erro{stateLabel}</Badge>;
    }
  };

  const getWebhookIcon = (webhookStatus: string) => {
    switch (webhookStatus) {
      case 'configured':
        return <Link className="h-3.5 w-3.5 text-green-500" />;
      case 'events_missing':
        return <Link2Off className="h-3.5 w-3.5 text-orange-500" />;
      case 'disabled':
        return <Link2Off className="h-3.5 w-3.5 text-yellow-500" />;
      case 'misconfigured':
        return <Link2Off className="h-3.5 w-3.5 text-yellow-500" />;
      case 'not_configured':
        return <Link2Off className="h-3.5 w-3.5 text-destructive" />;
      default:
        return <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getWebhookBadge = (webhookStatus: string) => {
    switch (webhookStatus) {
      case 'configured':
        return <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">Webhook OK</Badge>;
      case 'events_missing':
        return <Badge variant="outline" className="text-xs border-orange-500/50 text-orange-600">Eventos Vazios</Badge>;
      case 'disabled':
        return <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">Webhook Desabilitado</Badge>;
      case 'misconfigured':
        return <Badge variant="outline" className="text-xs border-yellow-500/50 text-yellow-600">Webhook Errado</Badge>;
      case 'not_configured':
        return <Badge variant="outline" className="text-xs border-destructive/50 text-destructive">Sem Webhook</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Webhook ?</Badge>;
    }
  };

  const formatLastCheck = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca verificado';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora mesmo';
    if (diffMins < 60) return `${diffMins} min atrás`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h atrás`;
    
    return date.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-24">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (instances.length === 0) {
    return null;
  }

  const connectedCount = instances.filter(i => i.status === 'connected').length;
  const webhookOkCount = instances.filter(i => i.webhookStatus === 'configured').length;
  const totalCount = instances.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {connectedCount === totalCount && webhookOkCount === totalCount ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            )}
            Status das Instâncias
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Verifica o status da sessão WhatsApp e a configuração do webhook.
                    Conexão: open/close/connecting. Webhook: configurado/incorreto/ausente.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={checkAllInstances}
            disabled={checking}
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>{connectedCount}/{totalCount} conectadas</span>
          <span>•</span>
          <span>{webhookOkCount}/{totalCount} webhooks OK</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {instances.map((instance) => (
          <div 
            key={instance.configId}
            className="flex flex-col gap-2 p-2 rounded-lg bg-muted/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div 
                  className="h-2 w-2 rounded-full" 
                  style={{ backgroundColor: instance.color }}
                />
                <span className="text-sm font-medium">{instance.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatLastCheck(instance.lastCheck)}
                </div>
                {getStatusIcon(instance.status)}
                {getStatusBadge(instance.status, instance.rawState)}
              </div>
            </div>
            
            {/* Webhook status row */}
            <div className="flex items-center justify-between pl-4">
              <div className="flex items-center gap-2">
                {getWebhookIcon(instance.webhookStatus)}
                {getWebhookBadge(instance.webhookStatus)}
              </div>
              {instance.webhookStatus !== 'configured' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => fixWebhook(instance.configId)}
                  disabled={fixingWebhook === instance.configId}
                >
                  {fixingWebhook === instance.configId ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wrench className="h-3 w-3" />
                  )}
                  Corrigir
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

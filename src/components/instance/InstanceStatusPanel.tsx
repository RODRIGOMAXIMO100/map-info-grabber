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
  Info
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

        // Extract rawState from details
        const details = status?.details as Record<string, unknown> | null;
        const rawState = details?.rawState as string | null;

        return {
          configId: config.id,
          name: config.name || 'Instância',
          status: (status?.status as 'connected' | 'disconnected' | 'connecting' | 'error') || 'error',
          rawState: rawState || null,
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
  const totalCount = instances.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {connectedCount === totalCount ? (
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
                    Verifica o status real da sessão WhatsApp usando o endpoint <code>/instance/connectionState</code>.
                    Estados: open (conectado), close (desconectado), connecting (conectando), refused (recusado).
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
        <p className="text-xs text-muted-foreground">
          {connectedCount}/{totalCount} conectadas
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {instances.map((instance) => (
          <div 
            key={instance.configId}
            className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
          >
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
        ))}
      </CardContent>
    </Card>
  );
}

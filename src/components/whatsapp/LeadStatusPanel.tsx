import { Bot, BotOff, Users, MessageSquare, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface LeadStatusPanelProps {
  conversation: {
    id: string;
    is_crm_lead?: boolean;
    ai_paused?: boolean;
    ai_handoff_reason?: string | null;
    is_group?: boolean;
    tags?: string[];
  };
  onUpdate?: () => void;
}

const FUNNEL_STAGES = [
  'Lead Novo',
  'Apresentação Feita', 
  'Interesse Confirmado',
  'Negociando',
  'Convertido'
];

export function LeadStatusPanel({ conversation, onUpdate }: LeadStatusPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isInFunnel = conversation.tags?.some(tag => FUNNEL_STAGES.includes(tag)) ?? false;

  // Determine AI status and reason
  const getAIStatus = () => {
    if (conversation.is_group) {
      return { 
        status: 'blocked', 
        reason: 'Grupos não são atendidos pela IA',
        icon: Users,
        color: 'text-muted-foreground'
      };
    }
    
    if (!conversation.is_crm_lead) {
      return { 
        status: 'blocked', 
        reason: conversation.ai_handoff_reason || 'Número não está em lista de broadcast',
        icon: AlertTriangle,
        color: 'text-yellow-500'
      };
    }

    if (conversation.ai_paused) {
      return { 
        status: 'paused', 
        reason: conversation.ai_handoff_reason || 'IA pausada manualmente',
        icon: BotOff,
        color: 'text-orange-500'
      };
    }

    if (!isInFunnel) {
      return { 
        status: 'blocked', 
        reason: 'Conversa fora do funil da IA',
        icon: MessageSquare,
        color: 'text-muted-foreground'
      };
    }

    return { 
      status: 'active', 
      reason: 'IA respondendo automaticamente',
      icon: Bot,
      color: 'text-green-500'
    };
  };

  const aiStatus = getAIStatus();
  const StatusIcon = aiStatus.icon;

  // Mark as CRM lead and activate AI
  const handleMarkAsLead = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          is_crm_lead: true, 
          ai_paused: false,
          ai_handoff_reason: null,
          tags: conversation.tags?.includes('Lead Novo') 
            ? conversation.tags 
            : [...(conversation.tags || []), 'Lead Novo']
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: 'Lead ativado!',
        description: 'A IA agora responderá automaticamente.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error marking as lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível ativar o lead.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Resume AI for paused conversation
  const handleResumeAI = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: false,
          ai_handoff_reason: null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: 'IA Retomada',
        description: 'A IA voltará a responder automaticamente.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error resuming AI:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível retomar a IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-2">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn("h-4 w-4", aiStatus.color)} />
          <span className="text-sm font-medium">
            {aiStatus.status === 'active' ? 'IA Ativa' : 
             aiStatus.status === 'paused' ? 'IA Pausada' : 'IA Bloqueada'}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Badge variant={conversation.is_crm_lead ? "default" : "secondary"} className="text-xs">
            {conversation.is_crm_lead ? 'CRM Lead' : 'Não é Lead'}
          </Badge>
          {conversation.is_group && (
            <Badge variant="outline" className="text-xs">
              Grupo
            </Badge>
          )}
        </div>
      </div>

      {/* Reason */}
      <p className="text-xs text-muted-foreground">
        {aiStatus.reason}
      </p>

      {/* Current Funnel Stage */}
      {conversation.tags && conversation.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {conversation.tags.filter(t => FUNNEL_STAGES.includes(t)).map(tag => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1">
        {/* Show "Mark as Lead" if not a CRM lead and not a group */}
        {!conversation.is_crm_lead && !conversation.is_group && (
          <Button 
            size="sm" 
            variant="default"
            onClick={handleMarkAsLead}
            disabled={loading}
            className="text-xs h-7 gap-1"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            Ativar como Lead
          </Button>
        )}

        {/* Show "Resume AI" if paused but is CRM lead */}
        {conversation.is_crm_lead && conversation.ai_paused && !conversation.is_group && (
          <Button 
            size="sm" 
            variant="outline"
            onClick={handleResumeAI}
            disabled={loading}
            className="text-xs h-7 gap-1"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Bot className="h-3 w-3" />
            )}
            Retomar IA
          </Button>
        )}
      </div>
    </div>
  );
}
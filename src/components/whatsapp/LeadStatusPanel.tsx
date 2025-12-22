import { Bot, BotOff, Users, Loader2, Ban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface LeadStatusPanelProps {
  conversation: {
    id: string;
    ai_paused?: boolean;
    ai_handoff_reason?: string | null;
    is_group?: boolean;
    is_crm_lead?: boolean;
    tags?: string[];
  };
  onUpdate?: () => void;
}

const STAGE_NAMES: Record<string, string> = {
  '16': 'Lead Novo',
  '13': 'Apresentação Feita',
  '14': 'Interesse Confirmado',
  '20': 'Negociando',
  '21': 'Handoff',
  '22': 'Convertido',
  '23': 'Perdido'
};

export function LeadStatusPanel({ conversation, onUpdate }: LeadStatusPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const currentStage = conversation.tags?.find(tag => Object.keys(STAGE_NAMES).includes(tag));
  const isCrmLead = conversation.is_crm_lead === true;

  // Determine AI status
  const getAIStatus = () => {
    if (conversation.is_group) {
      return { 
        status: 'blocked', 
        reason: 'Grupos não são atendidos pela IA',
        icon: Users,
        color: 'text-muted-foreground'
      };
    }

    if (!isCrmLead) {
      return { 
        status: 'not_lead', 
        reason: 'Não é lead - IA não responderá',
        icon: Ban,
        color: 'text-muted-foreground'
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

    return { 
      status: 'active', 
      reason: 'IA respondendo automaticamente',
      icon: Bot,
      color: 'text-green-500'
    };
  };

  const aiStatus = getAIStatus();
  const StatusIcon = aiStatus.icon;

  const handlePauseAI = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: true,
          ai_handoff_reason: 'Pausado manualmente pelo usuário'
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: 'IA Pausada',
        description: 'A IA não responderá mais automaticamente.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error pausing AI:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível pausar a IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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

  const handleActivateAsLead = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          is_crm_lead: true,
          tags: ['16'], // Lead Novo
          ai_paused: false,
          ai_handoff_reason: null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: 'Lead Ativado',
        description: 'A IA começará a responder esta conversa.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error activating lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível ativar o lead.',
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
             aiStatus.status === 'paused' ? 'IA Pausada' : 
             aiStatus.status === 'not_lead' ? 'Não é Lead' : 'IA Bloqueada'}
          </span>
        </div>
        
        {conversation.is_group && (
          <Badge variant="outline" className="text-xs">
            Grupo
          </Badge>
        )}
        {isCrmLead && !conversation.is_group && (
          <Badge variant="default" className="text-xs bg-green-600">
            Lead
          </Badge>
        )}
      </div>

      {/* Reason */}
      <p className="text-xs text-muted-foreground">
        {aiStatus.reason}
      </p>

      {/* Current Stage */}
      {currentStage && isCrmLead && (
        <Badge variant="secondary" className="text-xs">
          {STAGE_NAMES[currentStage] || currentStage}
        </Badge>
      )}

      {/* Action Buttons */}
      {!conversation.is_group && (
        <div className="flex gap-2 pt-1">
          {!isCrmLead ? (
            <Button 
              size="sm" 
              variant="default"
              onClick={handleActivateAsLead}
              disabled={loading}
              className="text-xs h-7 gap-1 bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Bot className="h-3 w-3" />
              )}
              Ativar como Lead
            </Button>
          ) : conversation.ai_paused ? (
            <Button 
              size="sm" 
              variant="default"
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
          ) : (
            <Button 
              size="sm" 
              variant="outline"
              onClick={handlePauseAI}
              disabled={loading}
              className="text-xs h-7 gap-1"
            >
              {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <BotOff className="h-3 w-3" />
              )}
              Pausar IA
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

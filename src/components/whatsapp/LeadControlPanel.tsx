import { Bot, BotOff, Loader2, Radio, Megaphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { CRM_STAGES } from '@/types/whatsapp';

interface LeadControlPanelProps {
  conversation: {
    id: string;
    ai_paused?: boolean;
    ai_handoff_reason?: string | null;
    is_group?: boolean;
    is_crm_lead?: boolean;
    origin?: string | null;
    funnel_stage?: string | null;
  };
  onUpdate?: () => void;
}

const ORIGINS = [
  { id: 'random', label: 'Aleatório', icon: Radio },
  { id: 'broadcast', label: 'Broadcast', icon: Megaphone }
];

export function LeadControlPanel({ conversation, onUpdate }: LeadControlPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isAiActive = conversation.is_crm_lead && !conversation.ai_paused && !conversation.is_group;
  const currentOrigin = conversation.origin || 'random';
  const currentStage = conversation.funnel_stage || 'new';
  const isCrmLead = conversation.is_crm_lead === true;

  const handleToggleAI = async () => {
    if (conversation.is_group) return;
    
    setLoading(true);
    try {
      const newPausedState = !conversation.ai_paused;
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: newPausedState,
          ai_handoff_reason: newPausedState ? 'Pausado manualmente' : null
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: newPausedState ? 'IA Pausada' : 'IA Ativada',
        description: newPausedState 
          ? 'A IA não responderá automaticamente.' 
          : 'A IA voltará a responder.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error toggling AI:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar status da IA.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLead = async () => {
    if (conversation.is_group) return;
    
    setLoading(true);
    try {
      const newLeadState = !conversation.is_crm_lead;
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ 
          is_crm_lead: newLeadState,
          funnel_stage: newLeadState ? 'new' : null,
          ai_paused: newLeadState ? false : true
        })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({
        title: newLeadState ? 'Lead Ativado' : 'Lead Desativado',
        description: newLeadState 
          ? 'A IA começará a responder.' 
          : 'Esta conversa não é mais um lead.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error toggling lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar status do lead.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOriginChange = async (value: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ origin: value })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Origem atualizada' });
      onUpdate?.();
    } catch (error) {
      console.error('Error updating origin:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar origem.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (value: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ funnel_stage: value })
        .eq('id', conversation.id);

      if (error) throw error;

      toast({ title: 'Etapa atualizada' });
      onUpdate?.();
    } catch (error) {
      console.error('Error updating stage:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar etapa.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't show controls for groups
  if (conversation.is_group) {
    return (
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Bot className="h-4 w-4" />
          <span className="text-sm">Grupos não são atendidos pela IA</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-muted/50 rounded-lg p-3 space-y-3">
      {/* Row 1: Lead toggle + AI toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="is-lead"
            checked={isCrmLead}
            onCheckedChange={handleToggleLead}
            disabled={loading}
          />
          <Label htmlFor="is-lead" className="text-sm cursor-pointer">
            É Lead
          </Label>
        </div>

        {isCrmLead && (
          <div className="flex items-center gap-2">
            <Switch
              id="ai-active"
              checked={isAiActive}
              onCheckedChange={handleToggleAI}
              disabled={loading}
            />
            <Label htmlFor="ai-active" className="text-sm cursor-pointer flex items-center gap-1">
              {isAiActive ? (
                <>
                  <Bot className="h-3 w-3 text-green-500" />
                  IA Ativa
                </>
              ) : (
                <>
                  <BotOff className="h-3 w-3 text-orange-500" />
                  IA Pausada
                </>
              )}
            </Label>
          </div>
        )}
      </div>

      {/* Row 2: Origin + Funnel Stage (only if lead) */}
      {isCrmLead && (
        <div className="flex items-center gap-2">
          <Select value={currentOrigin} onValueChange={handleOriginChange} disabled={loading}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {ORIGINS.map((origin) => (
                <SelectItem key={origin.id} value={origin.id} className="text-xs">
                  <div className="flex items-center gap-1">
                    <origin.icon className="h-3 w-3" />
                    {origin.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currentStage} onValueChange={handleStageChange} disabled={loading}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {CRM_STAGES.map((stage) => (
                <SelectItem key={stage.id} value={stage.id} className="text-xs">
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

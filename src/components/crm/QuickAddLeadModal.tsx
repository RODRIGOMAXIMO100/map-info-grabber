import { useState, useEffect } from 'react';
import { UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useInstances } from '@/hooks/useInstances';
import { useFunnels } from '@/hooks/useFunnels';
import { useStages } from '@/hooks/useStages';
import { toast } from 'sonner';

interface QuickAddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone: string;
  initialName?: string;
  defaultConfigId?: string;
}

export function QuickAddLeadModal({
  open,
  onOpenChange,
  initialPhone,
  initialName = '',
  defaultConfigId,
}: QuickAddLeadModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [funnelId, setFunnelId] = useState('');
  const [stageId, setStageId] = useState('');
  const [configId, setConfigId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: instances } = useInstances();
  const { data: funnels, isLoading: funnelsLoading } = useFunnels();
  const { data: stages, isLoading: stagesLoading } = useStages(funnelId || null);

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      setPhone(formatPhoneInput(initialPhone));
      setName(initialName);
      setConfigId(defaultConfigId || instances?.[0]?.id || '');
      setError(null);
      
      // Set default funnel
      const defaultFunnel = funnels?.find(f => f.is_default) || funnels?.[0];
      if (defaultFunnel) {
        setFunnelId(defaultFunnel.id);
      }
    }
  }, [open, initialPhone, initialName, instances, defaultConfigId, funnels]);

  // Reset stageId when funnel changes or stages load
  useEffect(() => {
    if (stages && stages.length > 0) {
      setStageId(stages[0].id);
    } else {
      setStageId('');
    }
  }, [stages, funnelId]);

  // Format phone as user types (Brazilian format)
  const formatPhoneInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.startsWith('55') && digits.length > 11 
      ? digits.slice(2) 
      : digits;
    
    if (localDigits.length <= 2) return localDigits;
    if (localDigits.length <= 7) return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2)}`;
    if (localDigits.length <= 11) return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7)}`;
    return `(${localDigits.slice(0, 2)}) ${localDigits.slice(2, 7)}-${localDigits.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhone(formatted);
    setError(null);
  };

  const handleFunnelChange = (newFunnelId: string) => {
    setFunnelId(newFunnelId);
    setStageId(''); // Reset stage when funnel changes
  };

  const validatePhone = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      setError('Digite um telefone válido com DDD');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validatePhone()) return;
    if (!funnelId) {
      setError('Selecione um funil');
      return;
    }
    if (!stageId) {
      setError('Selecione um estágio');
      return;
    }
    if (!configId) {
      setError('Selecione uma instância de WhatsApp');
      return;
    }

    setSaving(true);
    try {
      const phoneDigits = phone.replace(/\D/g, '');
      const formattedPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;

      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone, name, phone_invalid, is_crm_lead, tags')
        .or(`phone.eq.${formattedPhone},phone.eq.${phoneDigits}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        if (existing.phone_invalid) {
          setError('Este número já foi identificado como não existente no WhatsApp');
          setSaving(false);
          return;
        }
        
        if (existing.is_crm_lead) {
          toast.info('Contato já existe', {
            description: `${existing.name || existing.phone} já está no CRM`,
          });
          onOpenChange(false);
          return;
        }
        
        const existingTags = (existing.tags as string[]) || [];
        const newTags = [...existingTags, '16'].filter((v, i, a) => a.indexOf(v) === i);
        
        const { error: updateError } = await supabase
          .from('whatsapp_conversations')
          .update({
            is_crm_lead: true,
            funnel_stage: stageId,
            crm_funnel_id: funnelId,
            name: name.trim() || existing.name || null,
            config_id: configId,
            tags: newTags,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;

        toast.success('Lead adicionado', {
          description: `${existing.name || existing.phone} foi adicionado ao CRM`,
        });
        onOpenChange(false);
        return;
      }

      const { error: insertError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: formattedPhone,
          name: name.trim() || null,
          status: 'active',
          is_crm_lead: true,
          config_id: configId,
          funnel_stage: stageId,
          crm_funnel_id: funnelId,
          tags: ['16'],
          origin: 'random',
        });

      if (insertError) throw insertError;

      toast.success('Lead adicionado', {
        description: `${name || formattedPhone} foi adicionado ao CRM`,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('Error saving lead:', err);
      setError('Erro ao adicionar lead. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const showFunnelSelect = funnels && funnels.length > 1;
  const noFunnelsAvailable = !funnelsLoading && (!funnels || funnels.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Adicionar ao CRM
          </DialogTitle>
          <DialogDescription>
            Adicione este contato como lead no funil.
          </DialogDescription>
        </DialogHeader>

        {noFunnelsAvailable ? (
          <div className="py-4">
            <p className="text-sm text-destructive">
              Você não tem funis disponíveis. Entre em contato com o administrador.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="quick-phone">Telefone</Label>
              <Input
                id="quick-phone"
                placeholder="(34) 99999-9999"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={16}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-name">Nome (opcional)</Label>
              <Input
                id="quick-name"
                placeholder="Nome do contato"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {showFunnelSelect && (
              <div className="space-y-2">
                <Label htmlFor="quick-funnel">Funil</Label>
                <Select value={funnelId} onValueChange={handleFunnelChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil..." />
                  </SelectTrigger>
                  <SelectContent>
                    {funnels?.map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        {funnel.name}
                        {funnel.is_default && ' (padrão)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="quick-stage">Estágio</Label>
              <Select 
                value={stageId} 
                onValueChange={setStageId}
                disabled={stagesLoading || !funnelId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={stagesLoading ? "Carregando..." : "Selecione..."} />
                </SelectTrigger>
                <SelectContent>
                  {stages?.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-instance">Instância</Label>
              <Select value={configId} onValueChange={setConfigId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {instances?.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.name || 'Principal'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={saving || noFunnelsAvailable}
          >
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

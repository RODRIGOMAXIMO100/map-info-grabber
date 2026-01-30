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
import { useDefaultFunnel } from '@/hooks/useFunnels';
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
  const [stageId, setStageId] = useState('');
  const [configId, setConfigId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: instances } = useInstances();
  const { data: defaultFunnel } = useDefaultFunnel();
  const { data: stages } = useStages(defaultFunnel?.id || '');

  // Initialize form when modal opens
  useEffect(() => {
    if (open) {
      setPhone(formatPhoneInput(initialPhone));
      setName(initialName);
      setStageId(stages?.[0]?.id || '');
      setConfigId(defaultConfigId || instances?.[0]?.id || '');
      setError(null);
    }
  }, [open, initialPhone, initialName, stages, instances, defaultConfigId]);

  // Format phone as user types (Brazilian format)
  const formatPhoneInput = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Remove country code if present
    const localDigits = digits.startsWith('55') && digits.length > 11 
      ? digits.slice(2) 
      : digits;
    
    // Apply Brazilian phone mask: (XX) XXXXX-XXXX
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
      // Format phone for database
      const phoneDigits = phone.replace(/\D/g, '');
      const formattedPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;

      // Check if conversation already exists
      const { data: existing } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone, name, phone_invalid, is_crm_lead, tags')
        .or(`phone.eq.${formattedPhone},phone.eq.${phoneDigits}`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Check if it's marked as invalid
        if (existing.phone_invalid) {
          setError('Este número já foi identificado como não existente no WhatsApp');
          setSaving(false);
          return;
        }
        
        // Se JÁ é lead do CRM, apenas informar
        if (existing.is_crm_lead) {
          toast.info('Contato já existe', {
            description: `${existing.name || existing.phone} já está no CRM`,
          });
          onOpenChange(false);
          return;
        }
        
        // Se existe mas NÃO é lead, atualizar para ser lead
        const existingTags = (existing.tags as string[]) || [];
        const newTags = [...existingTags, '16'].filter((v, i, a) => a.indexOf(v) === i);
        
        const { error: updateError } = await supabase
          .from('whatsapp_conversations')
          .update({
            is_crm_lead: true,
            funnel_stage: stageId,
            crm_funnel_id: defaultFunnel?.id,
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

      // Get stage info for funnel_stage field
      const stage = stages?.find(s => s.id === stageId);

      // Create new conversation/lead
      const { error: insertError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: formattedPhone,
          name: name.trim() || null,
          status: 'active',
          is_crm_lead: true,
          config_id: configId,
          funnel_stage: stageId,
          crm_funnel_id: defaultFunnel?.id,
          tags: ['16'], // Lead Novo tag
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

          <div className="space-y-2">
            <Label htmlFor="quick-stage">Estágio</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

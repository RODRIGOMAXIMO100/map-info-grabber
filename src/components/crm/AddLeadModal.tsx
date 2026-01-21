import { useState, useEffect, useMemo } from 'react';
import { UserPlus, MapPin, Megaphone, AlertTriangle } from 'lucide-react';
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { CRMFunnelStage } from '@/types/crm';
import { CITIES_BY_STATE } from '@/data/brazilianCities';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface WhatsAppConfig {
  id: string;
  name: string | null;
}

interface BroadcastList {
  id: string;
  name: string;
  status: string;
}

interface AddLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: CRMFunnelStage[];
  whatsappConfigs: WhatsAppConfig[];
  broadcastLists: BroadcastList[];
  onSave: (data: {
    phone: string;
    name?: string;
    stageId: string;
    configId: string;
    city?: string;
    state?: string;
    broadcastListId?: string;
  }) => Promise<void>;
}

const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export function AddLeadModal({
  open,
  onOpenChange,
  stages,
  whatsappConfigs,
  broadcastLists,
  onSave,
}: AddLeadModalProps) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [stageId, setStageId] = useState('');
  const [configId, setConfigId] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [broadcastListId, setBroadcastListId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidPhoneWarning, setInvalidPhoneWarning] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');

  // Get cities for selected state, filtered by search
  const citiesForState = useMemo(() => {
    if (!state) return [];
    const allCities = CITIES_BY_STATE[state]?.map(c => c.city) || [];
    if (!citySearch) return allCities;
    return allCities.filter(c => 
      c.toLowerCase().includes(citySearch.toLowerCase())
    );
  }, [state, citySearch]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setPhone('');
      setName('');
      setStageId(stages?.[0]?.id || '');
      setConfigId(whatsappConfigs?.[0]?.id || '');
      setState('');
      setCity('');
      setBroadcastListId('');
      setError(null);
      setInvalidPhoneWarning(false);
    }
  }, [open, stages, whatsappConfigs]);

  // Reset city and search when state changes
  useEffect(() => {
    setCity('');
    setCitySearch('');
  }, [state]);

  // Format phone as user types (Brazilian format)
  const formatPhoneInput = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Apply Brazilian phone mask: (XX) XXXXX-XXXX
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
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
    setError(null);
    
    try {
      // Format phone for database check
      const phoneDigits = phone.replace(/\D/g, '');
      const formattedPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
      
      // Check if phone is already marked as invalid in the database
      const { data: existingConv } = await supabase
        .from('whatsapp_conversations')
        .select('id, phone_invalid')
        .or(`phone.eq.${formattedPhone},phone.eq.${phoneDigits}`)
        .limit(1)
        .maybeSingle();
      
      if (existingConv?.phone_invalid) {
        setError('Este número já foi identificado como não existente no WhatsApp');
        setInvalidPhoneWarning(true);
        setSaving(false);
        return;
      }
      
      await onSave({
        phone,
        name: name.trim() || undefined,
        stageId,
        configId,
        city: city.trim() || undefined,
        state: state || undefined,
        broadcastListId: broadcastListId || undefined,
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Adicionar Lead Manual
          </DialogTitle>
          <DialogDescription>
            Adicione um novo lead ao funil para acompanhar e enviar mensagens.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone *</Label>
            <Input
              id="phone"
              placeholder="(34) 99999-9999"
              value={phone}
              onChange={handlePhoneChange}
              maxLength={16}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome (opcional)</Label>
            <Input
              id="name"
              placeholder="Nome do contato"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Location Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                Estado
              </Label>
              <Select value={state} onValueChange={setState}>
                <SelectTrigger>
                  <SelectValue placeholder="UF" />
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_STATES.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Cidade</Label>
              <Popover open={cityOpen} onOpenChange={(open) => {
                setCityOpen(open);
                if (!open) setCitySearch('');
              }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={cityOpen}
                    className={cn(
                      "w-full justify-between font-normal",
                      !city && "text-muted-foreground"
                    )}
                  >
                    {city || "Digitar cidade..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Buscar ou digitar..." 
                      value={citySearch}
                      onValueChange={setCitySearch}
                    />
                    <CommandList>
                      {/* Option to use typed value */}
                      {citySearch && !citiesForState.some(c => 
                        c.toLowerCase() === citySearch.toLowerCase()
                      ) && (
                        <CommandItem
                          value={`use-custom-${citySearch}`}
                          onSelect={() => {
                            setCity(citySearch);
                            setCityOpen(false);
                            setCitySearch('');
                          }}
                        >
                          <span className="text-primary">Usar: "{citySearch}"</span>
                        </CommandItem>
                      )}
                      
                      {/* Suggested cities from database */}
                      {citiesForState.length > 0 && (
                        <CommandGroup heading={state ? `Cidades de ${state}` : 'Selecione um estado'}>
                          {citiesForState.map((cityName) => (
                            <CommandItem
                              key={cityName}
                              value={cityName}
                              onSelect={() => {
                                setCity(cityName);
                                setCityOpen(false);
                                setCitySearch('');
                              }}
                            >
                              {cityName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                      
                      {citiesForState.length === 0 && !citySearch && state && (
                        <CommandEmpty>Digite o nome da cidade</CommandEmpty>
                      )}
                      
                      {!state && (
                        <CommandEmpty>Selecione um estado primeiro ou digite a cidade</CommandEmpty>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Broadcast List */}
          {broadcastLists && broadcastLists.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Megaphone className="h-3.5 w-3.5" />
                Lista de Disparo (opcional)
              </Label>
              <Select value={broadcastListId || "none"} onValueChange={(v) => setBroadcastListId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Nenhuma lista selecionada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {broadcastLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="stage">Estágio Inicial</Label>
            <Select value={stageId} onValueChange={setStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um estágio" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
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
            <Label htmlFor="instance">Instância WhatsApp</Label>
            <Select value={configId} onValueChange={setConfigId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma instância" />
              </SelectTrigger>
              <SelectContent>
                {whatsappConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.name || 'Instância Principal'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className={cn(
              "text-sm flex items-center gap-2",
              invalidPhoneWarning ? "text-destructive" : "text-destructive"
            )}>
              {invalidPhoneWarning && <AlertTriangle className="h-4 w-4" />}
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Adicionando...' : 'Adicionar Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

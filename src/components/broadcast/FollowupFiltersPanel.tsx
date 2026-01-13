import { useState, useEffect } from 'react';
import { MapPin, GitBranch, Radio, MessageSquare, Calendar, Filter } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

export interface FollowupFilters {
  cities: string[];
  funnelStages: string[];
  broadcastListId: string | null;
  responded: 'all' | 'yes' | 'no';
  maxFollowupCount: number | null;
  minDaysSinceBroadcast: number | null;
}

interface FollowupFiltersPanelProps {
  filters: FollowupFilters;
  onFiltersChange: (filters: FollowupFilters) => void;
}

interface BroadcastListOption {
  id: string;
  name: string;
}

interface FunnelStageOption {
  id: string;
  name: string;
}

export function FollowupFiltersPanel({ filters, onFiltersChange }: FollowupFiltersPanelProps) {
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [availableStages, setAvailableStages] = useState<FunnelStageOption[]>([]);
  const [availableLists, setAvailableLists] = useState<BroadcastListOption[]>([]);
  const [citySearch, setCitySearch] = useState('');

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    // Load unique cities from conversations
    const { data: citiesData } = await supabase
      .from('whatsapp_conversations')
      .select('lead_city')
      .not('lead_city', 'is', null)
      .not('lead_city', 'eq', '');

    if (citiesData) {
      const uniqueCities = [...new Set(citiesData.map(c => c.lead_city).filter(Boolean))] as string[];
      setAvailableCities(uniqueCities.sort());
    }

    // Load funnel stages
    const { data: stagesData } = await supabase
      .from('crm_funnel_stages')
      .select('id, name')
      .order('stage_order');

    if (stagesData) {
      setAvailableStages(stagesData);
    }

    // Load broadcast lists
    const { data: listsData } = await supabase
      .from('broadcast_lists')
      .select('id, name')
      .order('created_at', { ascending: false });

    if (listsData) {
      setAvailableLists(listsData);
    }
  };

  const toggleCity = (city: string) => {
    const newCities = filters.cities.includes(city)
      ? filters.cities.filter(c => c !== city)
      : [...filters.cities, city];
    onFiltersChange({ ...filters, cities: newCities });
  };

  const toggleStage = (stageId: string) => {
    const newStages = filters.funnelStages.includes(stageId)
      ? filters.funnelStages.filter(s => s !== stageId)
      : [...filters.funnelStages, stageId];
    onFiltersChange({ ...filters, funnelStages: newStages });
  };

  const clearFilters = () => {
    onFiltersChange({
      cities: [],
      funnelStages: [],
      broadcastListId: null,
      responded: 'all',
      maxFollowupCount: null,
      minDaysSinceBroadcast: null,
    });
  };

  const filteredCities = citySearch
    ? availableCities.filter(c => c.toLowerCase().includes(citySearch.toLowerCase()))
    : availableCities;

  const hasActiveFilters = 
    filters.cities.length > 0 ||
    filters.funnelStages.length > 0 ||
    filters.broadcastListId ||
    filters.responded !== 'all' ||
    filters.maxFollowupCount !== null ||
    filters.minDaysSinceBroadcast !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Filtros de Segmentação</h3>
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Limpar Filtros
          </Button>
        )}
      </div>

      {/* Cidade */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Cidade
        </Label>
        <Input
          placeholder="Buscar cidade..."
          value={citySearch}
          onChange={(e) => setCitySearch(e.target.value)}
          className="mb-2"
        />
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {filteredCities.slice(0, 20).map((city) => (
            <Badge
              key={city}
              variant={filters.cities.includes(city) ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80"
              onClick={() => toggleCity(city)}
            >
              {city}
            </Badge>
          ))}
          {filteredCities.length > 20 && (
            <span className="text-xs text-muted-foreground">
              +{filteredCities.length - 20} cidades
            </span>
          )}
        </div>
        {filters.cities.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {filters.cities.length} cidade(s) selecionada(s)
          </p>
        )}
      </div>

      {/* Etapa do Funil */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Etapa do Funil
        </Label>
        <div className="flex flex-wrap gap-2">
          {availableStages.map((stage) => (
            <Badge
              key={stage.id}
              variant={filters.funnelStages.includes(stage.id) ? 'default' : 'outline'}
              className="cursor-pointer hover:bg-primary/80"
              onClick={() => toggleStage(stage.id)}
            >
              {stage.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Campanha Original */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Campanha Original
        </Label>
        <Select
          value={filters.broadcastListId || 'all'}
          onValueChange={(value) => 
            onFiltersChange({ 
              ...filters, 
              broadcastListId: value === 'all' ? null : value 
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Todas as campanhas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as campanhas</SelectItem>
            {availableLists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status de Resposta */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Status de Resposta
        </Label>
        <Select
          value={filters.responded}
          onValueChange={(value: 'all' | 'yes' | 'no') => 
            onFiltersChange({ ...filters, responded: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="no">Não responderam</SelectItem>
            <SelectItem value="yes">Responderam</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Follow-ups Recebidos */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Máximo de Follow-ups Recebidos
        </Label>
        <Input
          type="number"
          min="0"
          placeholder="Ex: 0 (nunca recebeu follow-up)"
          value={filters.maxFollowupCount ?? ''}
          onChange={(e) => 
            onFiltersChange({ 
              ...filters, 
              maxFollowupCount: e.target.value ? parseInt(e.target.value) : null 
            })
          }
        />
      </div>

      {/* Dias desde Broadcast */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Mínimo de Dias desde o Broadcast
        </Label>
        <Input
          type="number"
          min="1"
          placeholder="Ex: 3 (broadcast há pelo menos 3 dias)"
          value={filters.minDaysSinceBroadcast ?? ''}
          onChange={(e) => 
            onFiltersChange({ 
              ...filters, 
              minDaysSinceBroadcast: e.target.value ? parseInt(e.target.value) : null 
            })
          }
        />
      </div>
    </div>
  );
}

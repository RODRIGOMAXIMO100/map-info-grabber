import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Location, BRAZILIAN_STATES } from '@/types/business';

interface LocationSelectorProps {
  locations: Location[];
  onAdd: (location: Location) => void;
  onRemove: (index: number) => void;
}

export function LocationSelector({ locations, onAdd, onRemove }: LocationSelectorProps) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  const handleAdd = () => {
    if (city.trim() && state) {
      onAdd({ city: city.trim(), state });
      setCity('');
      setState('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-4">
      {/* Campo de cidade - linha inteira */}
      <Input
        placeholder="Digite o nome da cidade"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full text-base"
      />

      {/* UF + Botão */}
      <div className="flex gap-2">
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Selecione UF" />
          </SelectTrigger>
          <SelectContent className="bg-background border">
            {BRAZILIAN_STATES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.value} - {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          type="button" 
          onClick={handleAdd} 
          disabled={!city.trim() || !state}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {/* Área de cidades selecionadas */}
      <div className="border rounded-md p-3 min-h-[120px] max-h-[200px] bg-muted/30">
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Nenhuma localização adicionada
          </p>
        ) : (
          <ScrollArea className="h-full max-h-[176px]">
            <div className="flex flex-wrap gap-2">
              {locations.map((loc, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1 py-1.5 px-3 text-sm">
                  {loc.city}, {loc.state}
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

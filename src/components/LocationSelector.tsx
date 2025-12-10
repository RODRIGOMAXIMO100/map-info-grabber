import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
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
      <div className="flex gap-2">
        <Input
          placeholder="Cidade"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="UF" />
          </SelectTrigger>
          <SelectContent className="bg-background border">
            {BRAZILIAN_STATES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          type="button" 
          onClick={handleAdd} 
          disabled={!city.trim() || !state}
          size="icon"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {locations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((loc, index) => (
            <Badge key={index} variant="secondary" className="flex items-center gap-1 py-1 px-2">
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
      )}
    </div>
  );
}

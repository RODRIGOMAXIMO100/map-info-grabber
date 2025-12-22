import { useState, useMemo } from 'react';
import { Plus, X, MapPin, Building2, Map } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Location, BRAZILIAN_STATES } from '@/types/business';
import { getCitiesByState, getTotalCitiesForState, formatPopulation } from '@/data/brazilianCities';

interface LocationSelectorProps {
  locations: Location[];
  onAdd: (location: Location) => void;
  onRemove: (index: number) => void;
}

export function LocationSelector({ locations, onAdd, onRemove }: LocationSelectorProps) {
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [multipleCities, setMultipleCities] = useState('');
  const [bulkState, setBulkState] = useState('');
  const [stateWideState, setStateWideState] = useState('');
  const [cityCount, setCityCount] = useState([10]);

  const maxCities = useMemo(() => {
    return stateWideState ? getTotalCitiesForState(stateWideState) : 50;
  }, [stateWideState]);

  const selectedCities = useMemo(() => {
    if (!stateWideState) return [];
    return getCitiesByState(stateWideState, cityCount[0]);
  }, [stateWideState, cityCount]);

  const totalPopulation = useMemo(() => {
    return selectedCities.reduce((sum, c) => sum + c.population, 0);
  }, [selectedCities]);

  const handleAddSingle = () => {
    if (city.trim() && state) {
      onAdd({ city: city.trim(), state });
      setCity('');
    }
  };

  const handleAddMultiple = () => {
    if (multipleCities.trim() && bulkState) {
      const cities = multipleCities
        .split(/[\n,]+/)
        .map(c => c.trim())
        .filter(c => c.length > 0);
      
      cities.forEach(cityName => {
        onAdd({ city: cityName, state: bulkState });
      });
      
      setMultipleCities('');
    }
  };

  const handleAddStateWide = () => {
    if (stateWideState && selectedCities.length > 0) {
      // Verificar quais cidades já estão na lista
      const existingCities = new Set(
        locations
          .filter(l => l.state === stateWideState)
          .map(l => l.city.toLowerCase())
      );
      
      let addedCount = 0;
      selectedCities.forEach(cityData => {
        if (!existingCities.has(cityData.city.toLowerCase())) {
          onAdd({ city: cityData.city, state: stateWideState });
          addedCount++;
        }
      });

      if (addedCount === 0) {
        // Todas já existem
        console.log('Todas as cidades selecionadas já estão na lista');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSingle();
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="single" className="gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Uma cidade</span>
            <span className="sm:hidden">Uma</span>
          </TabsTrigger>
          <TabsTrigger value="multiple" className="gap-1.5 text-xs sm:text-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Várias cidades</span>
            <span className="sm:hidden">Várias</span>
          </TabsTrigger>
          <TabsTrigger value="state" className="gap-1.5 text-xs sm:text-sm">
            <Map className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Estado inteiro</span>
            <span className="sm:hidden">Estado</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="space-y-3 mt-3">
          <Input
            placeholder="Digite o nome da cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full text-base"
          />
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
              onClick={handleAddSingle} 
              disabled={!city.trim() || !state}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="multiple" className="space-y-3 mt-3">
          <Textarea
            placeholder="Separe por vírgula ou linha:&#10;São Paulo, Campinas, Santos&#10;ou uma por linha"
            value={multipleCities}
            onChange={(e) => setMultipleCities(e.target.value)}
            className="min-h-[100px] text-base"
          />
          <div className="flex gap-2">
            <Select value={bulkState} onValueChange={setBulkState}>
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
              onClick={handleAddMultiple} 
              disabled={!multipleCities.trim() || !bulkState}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar todas
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="state" className="space-y-4 mt-3">
          <Select value={stateWideState} onValueChange={(val) => {
            setStateWideState(val);
            const max = getTotalCitiesForState(val);
            setCityCount([Math.min(cityCount[0], max)]);
          }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione o estado" />
            </SelectTrigger>
            <SelectContent className="bg-background border">
              {BRAZILIAN_STATES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.value} - {s.label} ({getTotalCitiesForState(s.value)} cidades)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {stateWideState && (
            <>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantidade de cidades:</span>
                  <span className="font-medium">{cityCount[0]} cidades</span>
                </div>
                <Slider
                  value={cityCount}
                  onValueChange={setCityCount}
                  min={5}
                  max={maxCities}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>5</span>
                  <span>{maxCities}</span>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">População coberta:</span>
                  <span className="font-medium text-primary">{formatPopulation(totalPopulation)} habitantes</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Maiores cidades: {selectedCities.slice(0, 3).map(c => c.city).join(', ')}
                  {selectedCities.length > 3 && '...'}
                </div>
              </div>

              <Button 
                type="button" 
                onClick={handleAddStateWide}
                className="w-full gap-2"
              >
                <Map className="h-4 w-4" />
                Adicionar {cityCount[0]} cidades de {stateWideState}
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Área de cidades selecionadas */}
      <div className="border rounded-md p-3 min-h-[120px] max-h-[200px] bg-muted/30">
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            Nenhuma localização adicionada
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{locations.length} localização(ões)</span>
              {locations.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Remover todas
                    for (let i = locations.length - 1; i >= 0; i--) {
                      onRemove(i);
                    }
                  }}
                  className="text-xs text-destructive hover:text-destructive h-6 px-2"
                >
                  Limpar todas
                </Button>
              )}
            </div>
            <ScrollArea className="h-full max-h-[140px]">
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
          </>
        )}
      </div>
    </div>
  );
}

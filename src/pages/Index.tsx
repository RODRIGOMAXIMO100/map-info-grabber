import { useState } from 'react';
import { Search, Download, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { LocationSelector } from '@/components/LocationSelector';
import { ResultsTable } from '@/components/ResultsTable';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { exportToCSV } from '@/lib/exportCsv';
import { Location } from '@/types/business';

export default function Index() {
  const [keyword, setKeyword] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const { search, results, isLoading, error } = useBusinessSearch();
  const { toast } = useToast();

  const handleAddLocation = (location: Location) => {
    setLocations(prev => {
      const exists = prev.some(
        (l) => l.city.toLowerCase() === location.city.toLowerCase() && l.state === location.state
      );
      if (exists) {
        toast({
          title: 'Localização já adicionada',
          description: `${location.city}, ${location.state} já está na lista.`,
          variant: 'destructive',
        });
        return prev;
      }
      return [...prev, location];
    });
  };

  const handleRemoveLocation = (index: number) => {
    setLocations(locations.filter((_, i) => i !== index));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) {
      toast({
        title: 'Campo obrigatório',
        description: 'Digite uma palavra-chave para buscar.',
        variant: 'destructive',
      });
      return;
    }
    if (locations.length === 0) {
      toast({
        title: 'Adicione uma localização',
        description: 'Adicione pelo menos uma cidade para buscar.',
        variant: 'destructive',
      });
      return;
    }
    await search(keyword, locations);
  };

  const handleExport = () => {
    if (results.length === 0) {
      toast({
        title: 'Nenhum resultado',
        description: 'Faça uma busca primeiro para exportar.',
        variant: 'destructive',
      });
      return;
    }
    exportToCSV(results, keyword.replace(/\s+/g, '_'));
    toast({
      title: 'Exportado!',
      description: `${results.length} empresas exportadas para CSV.`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <MapPin className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Busca de Empresas</h1>
          </div>
          <p className="text-muted-foreground">
            Encontre empresas no Google Maps por palavra-chave e localização
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parâmetros de Busca</CardTitle>
            <CardDescription>
              Adicione a palavra-chave e as cidades onde deseja buscar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Palavra-chave</label>
                <Input
                  placeholder="Ex: pizzaria, dentista, academia..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Localizações</label>
                <LocationSelector
                  locations={locations}
                  onAdd={handleAddLocation}
                  onRemove={handleRemoveLocation}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExport}
                  disabled={results.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
              <CardDescription>
                {results.length} empresa{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResultsTable results={results} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

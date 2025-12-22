import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Search, Download, Loader2, MapPin, CheckCircle2, MessageCircle, Instagram, Settings, MessageSquare, Users, Bot, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { LocationSelector } from '@/components/LocationSelector';
import { ResultsTable } from '@/components/ResultsTable';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { exportToCSV } from '@/lib/exportCsv';
import { Location } from '@/types/business';

export default function Index() {
  const [keyword, setKeyword] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [maxResults, setMaxResults] = useState(20);
  const { search, results, isLoading, error, progress } = useBusinessSearch();
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
    await search(keyword, locations, maxResults);
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

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const stats = useMemo(() => ({
    whatsapp: results.filter(r => r.whatsapp).length,
    instagram: results.filter(r => r.instagram).length,
    phone: results.filter(r => r.phone).length,
    website: results.filter(r => r.website && r.website.startsWith('http') && !r.website.includes('wa.me') && !r.website.includes('instagram.com')).length,
  }), [results]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link to="/whatsapp/config"><Settings className="h-4 w-4 mr-1" /> Config WhatsApp</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/whatsapp/chat"><MessageSquare className="h-4 w-4 mr-1" /> Chat</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/whatsapp/broadcast"><Send className="h-4 w-4 mr-1" /> Disparos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/crm"><Users className="h-4 w-4 mr-1" /> CRM</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/ai-config"><Bot className="h-4 w-4 mr-1" /> Config IA</Link>
          </Button>
        </div>

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

              <div>
                <label className="text-sm font-medium mb-2 block">Quantidade de contatos por cidade</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxResults}
                    onChange={(e) => setMaxResults(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">
                    (máx. 200 por cidade)
                  </span>
                </div>
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
                  disabled={results.length === 0 || isLoading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {isLoading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center space-y-1">
                  <p className="font-medium">
                    Buscando {progress.current} de {progress.total} cidade{progress.total !== 1 ? 's' : ''}...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {progress.currentCity}
                  </p>
                  {results.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {results.length} empresa{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                <div className="w-full max-w-xs">
                  <Progress value={progressPercent} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {(results.length > 0 || isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle>Resultados</CardTitle>
              <CardDescription>
                {results.length} empresa{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''}
                {isLoading && ' (buscando mais...)'}
              </CardDescription>
              {results.length > 0 && (
                <div className="flex flex-wrap gap-4 mt-3 text-sm">
                  <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                    <MessageCircle className="h-4 w-4" />
                    <span>{stats.whatsapp} com WhatsApp</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-pink-600 dark:text-pink-400">
                    <Instagram className="h-4 w-4" />
                    <span>{stats.instagram} com Instagram</span>
                  </div>
                </div>
              )}
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

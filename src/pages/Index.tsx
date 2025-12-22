import { useState, useMemo } from 'react';
import { Search, Download, Loader2, MapPin, CheckCircle2, MessageCircle, Instagram, Star, Map, Sparkles, Zap, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { LocationSelector } from '@/components/LocationSelector';
import { ResultsTable } from '@/components/ResultsTable';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { useInstagramSearch, InstagramResult } from '@/hooks/useInstagramSearch';
import { exportToCSV } from '@/lib/exportCsv';
import { Location, Business } from '@/types/business';

type SearchSource = 'maps' | 'instagram' | 'both';

export default function Index() {
  const [keyword, setKeyword] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [maxResultsPerCity, setMaxResultsPerCity] = useState(20);
  const [totalMaxResults, setTotalMaxResults] = useState(100);
  const [searchSource, setSearchSource] = useState<SearchSource>('both');
  const [filterWhatsAppOnly, setFilterWhatsAppOnly] = useState(false);

  // Estimate total leads
  const estimatedLeads = useMemo(() => {
    const sources = searchSource === 'both' ? 2 : 1;
    return locations.length * maxResultsPerCity * sources;
  }, [locations.length, maxResultsPerCity, searchSource]);
  
  const { search: searchMaps, cancel: cancelMaps, results: mapsResults, isLoading: mapsLoading, error: mapsError, progress: mapsProgress } = useBusinessSearch();
  const { search: searchInstagram, scrapeProfiles, results: instagramResults, isLoading: instagramLoading, isScraping, error: instagramError, progress: instagramProgress } = useInstagramSearch();
  
  const { toast } = useToast();

  const isLoading = mapsLoading || instagramLoading;

  // Convert Instagram results to Business format for unified display
  const convertedInstagramResults: Business[] = useMemo(() => {
    return instagramResults.map(ig => ({
      name: ig.name,
      address: `${ig.city}, ${ig.state}`,
      phone: ig.phone || '',
      website: ig.profileUrl,
      rating: null,
      reviews: null,
      city: ig.city,
      state: ig.state,
      place_id: `ig_${ig.username}`,
      whatsapp: ig.whatsapp,
      instagram: ig.instagram,
      source: 'instagram' as const,
      score: ig.score,
    }));
  }, [instagramResults]);

  // Combine and deduplicate results
  const combinedResults = useMemo(() => {
    const mapsWithSource = mapsResults.map(r => ({ ...r, source: 'google_maps' as const }));
    const all = [...mapsWithSource, ...convertedInstagramResults];
    
    // Deduplicate by phone or name similarity
    const unique = all.filter((item, index, self) => {
      if (item.phone) {
        const normalizedPhone = item.phone.replace(/\D/g, '');
        return index === self.findIndex(t => t.phone?.replace(/\D/g, '') === normalizedPhone);
      }
      return index === self.findIndex(t => t.name.toLowerCase() === item.name.toLowerCase());
    });
    
    // Sort by score if available
    return unique.sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [mapsResults, convertedInstagramResults]);

  // Apply filters
  const filteredResults = useMemo(() => {
    let results = combinedResults;
    if (filterWhatsAppOnly) {
      results = results.filter(r => r.whatsapp);
    }
    return results;
  }, [combinedResults, filterWhatsAppOnly]);

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
    
    // Search based on selected sources with total limit
    const promises: Promise<void>[] = [];
    
    if (searchSource === 'maps' || searchSource === 'both') {
      promises.push(searchMaps(keyword, locations, maxResultsPerCity, totalMaxResults));
    }
    
    if (searchSource === 'instagram' || searchSource === 'both') {
      promises.push(searchInstagram(keyword, locations, maxResultsPerCity, totalMaxResults));
    }
    
    await Promise.all(promises);
    
    toast({
      title: 'Busca concluída!',
      description: `Encontrados ${combinedResults.length} leads.`,
    });
  };

  const handleExport = () => {
    if (filteredResults.length === 0) {
      toast({
        title: 'Nenhum resultado',
        description: 'Faça uma busca primeiro para exportar.',
        variant: 'destructive',
      });
      return;
    }
    exportToCSV(filteredResults, keyword.replace(/\s+/g, '_'));
    toast({
      title: 'Exportado!',
      description: `${filteredResults.length} empresas exportadas para CSV.`,
    });
  };

  const currentProgress = mapsLoading ? mapsProgress : instagramProgress;
  const progressPercent = currentProgress.total > 0 ? (currentProgress.current / currentProgress.total) * 100 : 0;
  const showScrapingIndicator = isScraping;

  const stats = useMemo(() => ({
    total: filteredResults.length,
    whatsapp: filteredResults.filter(r => r.whatsapp).length,
    instagram: filteredResults.filter(r => r.instagram).length,
    fromMaps: filteredResults.filter(r => r.source === 'google_maps').length,
    fromInstagram: filteredResults.filter(r => r.source === 'instagram').length,
    highScore: filteredResults.filter(r => (r.score || 0) >= 4).length,
  }), [filteredResults]);

  const error = mapsError || instagramError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <Sparkles className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Prospecção Inteligente</h1>
          </div>
          <p className="text-muted-foreground">
            Busque leads no Google Maps e Instagram com extração automática de WhatsApp
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Parâmetros de Busca</CardTitle>
            <CardDescription>
              Configure sua busca multi-fonte para encontrar leads qualificados
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
                <label className="text-sm font-medium mb-2 block">Fontes de Busca</label>
                <Tabs value={searchSource} onValueChange={(v) => setSearchSource(v as SearchSource)} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="maps" className="flex items-center gap-2">
                      <Map className="h-4 w-4" />
                      Google Maps
                    </TabsTrigger>
                    <TabsTrigger value="instagram" className="flex items-center gap-2">
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </TabsTrigger>
                    <TabsTrigger value="both" className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Ambos
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Localizações</label>
                <LocationSelector
                  locations={locations}
                  onAdd={handleAddLocation}
                  onRemove={handleRemoveLocation}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Por cidade</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={200}
                      value={maxResultsPerCity}
                      onChange={(e) => setMaxResultsPerCity(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Limite total</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={totalMaxResults}
                      onChange={(e) => setTotalMaxResults(Math.max(1, Math.min(10000, Number(e.target.value) || 100)))}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="whatsapp-filter"
                    checked={filterWhatsAppOnly}
                    onCheckedChange={setFilterWhatsAppOnly}
                  />
                  <Label htmlFor="whatsapp-filter" className="text-sm">
                    Apenas com WhatsApp
                  </Label>
                </div>
              </div>

              {/* Estimation */}
              {locations.length > 0 && (
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span>
                    Estimativa: {locations.length} cidade{locations.length !== 1 ? 's' : ''} × {maxResultsPerCity} = ~{estimatedLeads.toLocaleString()} leads
                    {estimatedLeads > totalMaxResults && (
                      <span className="text-primary font-medium"> (limitado a {totalMaxResults.toLocaleString()})</span>
                    )}
                  </span>
                </div>
              )}

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
                      Buscar Leads
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExport}
                  disabled={filteredResults.length === 0 || isLoading}
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
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  {showScrapingIndicator && (
                    <Zap className="h-4 w-4 text-yellow-500 absolute -top-1 -right-1 animate-pulse" />
                  )}
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium">
                    {mapsLoading && !instagramLoading && 'Buscando no Google Maps...'}
                    {instagramLoading && !isScraping && 'Buscando perfis no Instagram...'}
                    {isScraping && 'Extraindo WhatsApp dos perfis...'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {currentProgress.currentCity}
                  </p>
                  {combinedResults.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {combinedResults.length} lead{combinedResults.length !== 1 ? 's' : ''} encontrado{combinedResults.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  
                  {/* Progress indicators */}
                  <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Zap className="h-3 w-3 text-yellow-500" />
                      Buscas paralelas
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3 text-blue-500" />
                      Cache ativo
                    </div>
                  </div>
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

        {(filteredResults.length > 0 || isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resultados
                {stats.highScore > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    <Star className="h-3 w-3 mr-1 text-yellow-500" />
                    {stats.highScore} alta qualidade
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {stats.total} lead{stats.total !== 1 ? 's' : ''} encontrado{stats.total !== 1 ? 's' : ''}
                {isLoading && ' (buscando mais...)'}
              </CardDescription>
              {stats.total > 0 && (
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  <Badge variant="outline" className="gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                    {stats.whatsapp} WhatsApp
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <Instagram className="h-3.5 w-3.5 text-pink-500" />
                    {stats.instagram} Instagram
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <Map className="h-3.5 w-3.5 text-blue-500" />
                    {stats.fromMaps} do Maps
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <Instagram className="h-3.5 w-3.5 text-purple-500" />
                    {stats.fromInstagram} do Instagram
                  </Badge>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <ResultsTable results={filteredResults} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

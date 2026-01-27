import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Search, Download, Loader2, MapPin, CheckCircle2, MessageCircle, Star, Sparkles, Database, Mail, Facebook, Linkedin, Award, Filter, Trash2, Globe, TrendingUp, AlertTriangle, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { LocationSelector } from '@/components/LocationSelector';
import { ResultsTable } from '@/components/ResultsTable';
import { SearchHistory, addSearchToHistory, type SavedSearch } from '@/components/prospecting/SearchHistory';
import { SearchStats } from '@/components/prospecting/SearchStats';
import { useBusinessSearch } from '@/hooks/useBusinessSearch';
import { exportToCSV } from '@/lib/exportCsv';
import { applyScoring } from '@/lib/leadScoring';
import { Location, Business } from '@/types/business';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'prospecting_results';
const STORAGE_KEY_KEYWORD = 'prospecting_keyword';

export default function Index() {
  const [keyword, setKeyword] = useState('');
  const [locations, setLocations] = useState<Location[]>([]);
  const [maxResultsPerCity, setMaxResultsPerCity] = useState(20);
  const [totalMaxResults, setTotalMaxResults] = useState(100);
  const [filterWhatsAppOnly, setFilterWhatsAppOnly] = useState(false);
  const [filterEmailOnly, setFilterEmailOnly] = useState(false);
  const [filterSocialOnly, setFilterSocialOnly] = useState(false);
  const [filterHighQualityOnly, setFilterHighQualityOnly] = useState(false);
  const [filterMobileOnly, setFilterMobileOnly] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [persistedResults, setPersistedResults] = useState<Business[]>([]);
  const [useEnrichment, setUseEnrichment] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchDuration, setSearchDuration] = useState<number | undefined>();
  const searchStartTime = useRef<number | null>(null);

  // Estimate total leads
  const estimatedLeads = useMemo(() => {
    return locations.length * maxResultsPerCity;
  }, [locations.length, maxResultsPerCity]);
  
  const { search: searchMaps, cancel: cancelMaps, results: mapsResults, isLoading, error, progress: mapsProgress, apiUsage } = useBusinessSearch();
  
  const { toast } = useToast();

  // Load persisted results on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedKeyword = localStorage.getItem(STORAGE_KEY_KEYWORD);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPersistedResults(parsed);
        }
      }
      if (savedKeyword) {
        setKeyword(savedKeyword);
      }
    } catch {
      // Silently fail on localStorage errors
    }
  }, []);

  // Persist results when they change
  useEffect(() => {
    if (mapsResults.length > 0) {
      const mapsWithSource = mapsResults.map(r => ({ ...r, source: 'google_maps' as const }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mapsWithSource));
      localStorage.setItem(STORAGE_KEY_KEYWORD, keyword);
      setPersistedResults(mapsWithSource);
    }
  }, [mapsResults, keyword]);

  // Clear persisted results
  const clearPersistedResults = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_KEYWORD);
    setPersistedResults([]);
    setSearchDuration(undefined);
    toast({
      title: 'Resultados limpos',
      description: 'Os resultados salvos foram removidos.',
    });
  }, [toast]);

  // Clear database cache
  const clearDatabaseCache = useCallback(async () => {
    try {
      const { error } = await supabase
        .from('search_cache')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      toast({
        title: 'Cache limpo',
        description: 'O cache do banco foi limpo. Novas buscas trarão dados frescos.',
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Falha ao limpar o cache.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Import phone validation for mobile filter
  const { validateBrazilianPhone } = useMemo(() => {
    const validateBrazilianPhone = (phone: string | null | undefined) => {
      if (!phone) return { isValid: false, isMobile: false };
      const digits = phone.replace(/\D/g, '');
      if (digits.startsWith('55') && digits.length > 11) {
        const localDigits = digits.slice(2);
        return {
          isValid: localDigits.length >= 10 && localDigits.length <= 11,
          isMobile: localDigits.length === 11 && localDigits[2] === '9',
        };
      }
      return {
        isValid: digits.length >= 10 && digits.length <= 11,
        isMobile: digits.length === 11 && digits[2] === '9',
      };
    };
    return { validateBrazilianPhone };
  }, []);

  // Combine and deduplicate results with scoring
  const combinedResults = useMemo(() => {
    const mapsWithSource = mapsResults.map(r => ({ ...r, source: 'google_maps' as const }));
    let all: Business[] = [...mapsWithSource];
    
    if (all.length === 0 && persistedResults.length > 0) {
      all = persistedResults.map(r => ({ ...r, source: r.source || 'google_maps' as const }));
    }
    
    const unique = all.filter((item, index, self) => {
      if (item.phone) {
        const normalizedPhone = item.phone.replace(/\D/g, '');
        return index === self.findIndex(t => t.phone?.replace(/\D/g, '') === normalizedPhone);
      }
      return index === self.findIndex(t => t.name.toLowerCase() === item.name.toLowerCase());
    });
    
    return applyScoring(unique).sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [mapsResults, persistedResults]);

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    combinedResults.forEach(r => {
      if (r.category) cats.add(r.category);
    });
    return Array.from(cats).sort();
  }, [combinedResults]);

  // Apply filters
  const filteredResults = useMemo(() => {
    let results = combinedResults;
    if (filterWhatsAppOnly) {
      results = results.filter(r => r.whatsapp);
    }
    if (filterEmailOnly) {
      results = results.filter(r => r.email);
    }
    if (filterSocialOnly) {
      results = results.filter(r => r.facebook || r.linkedin || r.instagram);
    }
    if (filterHighQualityOnly) {
      results = results.filter(r => (r.score || 0) >= 3);
    }
    if (filterMobileOnly) {
      results = results.filter(r => {
        const validation = validateBrazilianPhone(r.phone);
        return validation.isMobile;
      });
    }
    if (filterCategory && filterCategory !== 'all') {
      results = results.filter(r => r.category === filterCategory);
    }
    return results;
  }, [combinedResults, filterWhatsAppOnly, filterEmailOnly, filterSocialOnly, filterHighQualityOnly, filterMobileOnly, filterCategory, validateBrazilianPhone]);

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

  // Load search from history
  const handleSelectHistory = (search: SavedSearch) => {
    setKeyword(search.keyword);
    setLocations(search.locations);
    toast({
      title: 'Busca carregada',
      description: `"${search.keyword}" com ${search.locations.length} cidade(s)`,
    });
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
    
    searchStartTime.current = Date.now();
    setSearchDuration(undefined);
    
    await searchMaps(keyword, locations, maxResultsPerCity, totalMaxResults, useEnrichment);
    
    // Calculate duration
    if (searchStartTime.current) {
      const duration = Math.round((Date.now() - searchStartTime.current) / 1000);
      setSearchDuration(duration);
    }
    
    // Save to history
    addSearchToHistory(keyword, locations, combinedResults.length);
    
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

  const progressPercent = mapsProgress.total > 0 ? (mapsProgress.current / mapsProgress.total) * 100 : 0;

  const activeFiltersCount = [filterWhatsAppOnly, filterEmailOnly, filterSocialOnly, filterHighQualityOnly, filterMobileOnly, filterCategory !== 'all'].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-primary">
            <Sparkles className="h-8 w-8" />
            <h1 className="text-3xl font-bold">Prospecção Inteligente</h1>
          </div>
          <p className="text-muted-foreground">
            Busque leads no Google Maps com extração automática de WhatsApp
          </p>
        </div>

        {/* API Usage Card */}
        <Card className="border-green-500/30 bg-green-500/5">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-700 dark:text-green-400">Google Maps via Serper</span>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="outline" className="gap-1.5 border-blue-500/50 text-blue-600">
                  <Globe className="h-3 w-3" />
                  Serper: {apiUsage.serper}
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-purple-500/50 text-purple-600">
                  <Database className="h-3 w-3" />
                  Cache: {apiUsage.cache}
                </Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Ordem de prioridade: Cache → Serper. Retry automático em caso de falha.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parâmetros de Busca</CardTitle>
            <CardDescription>
              Configure sua busca para encontrar leads qualificados no Google Maps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="space-y-4">
              {/* Search History */}
              <SearchHistory onSelect={handleSelectHistory} className="mb-2" />
              
              <div>
                <label className="text-sm font-medium mb-2 block">Palavra-chave</label>
                <Input
                  placeholder="Ex: pizzaria, dentista, academia..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="text-base"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Por cidade</label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={maxResultsPerCity}
                    onChange={(e) => setMaxResultsPerCity(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Limite total</label>
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

              {/* Enrichment Option */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enrichment" className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      Enriquecer dados (Instagram/Email)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Usa Firecrawl para extrair redes sociais dos sites
                    </p>
                  </div>
                  <Switch
                    id="enrichment"
                    checked={useEnrichment}
                    onCheckedChange={setUseEnrichment}
                  />
                </div>
              </div>

              {/* Collapsible Filters */}
              <Collapsible open={showAdvancedFilters} onOpenChange={setShowAdvancedFilters}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    type="button"
                    className="w-full justify-between text-muted-foreground hover:text-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Filtros avançados
                      {activeFiltersCount > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                          {activeFiltersCount}
                        </Badge>
                      )}
                    </span>
                    {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="whatsapp-filter"
                        checked={filterWhatsAppOnly}
                        onCheckedChange={setFilterWhatsAppOnly}
                      />
                      <Label htmlFor="whatsapp-filter" className="text-sm flex items-center gap-1.5">
                        <MessageCircle className="h-4 w-4 text-green-600" />
                        WhatsApp
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="email-filter"
                        checked={filterEmailOnly}
                        onCheckedChange={setFilterEmailOnly}
                      />
                      <Label htmlFor="email-filter" className="text-sm flex items-center gap-1.5">
                        <Mail className="h-4 w-4 text-orange-600" />
                        Email
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="social-filter"
                        checked={filterSocialOnly}
                        onCheckedChange={setFilterSocialOnly}
                      />
                      <Label htmlFor="social-filter" className="text-sm flex items-center gap-1.5">
                        <Facebook className="h-4 w-4 text-blue-600" />
                        Redes Sociais
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="quality-filter"
                        checked={filterHighQualityOnly}
                        onCheckedChange={setFilterHighQualityOnly}
                      />
                      <Label htmlFor="quality-filter" className="text-sm flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-yellow-600" />
                        Alta Qualidade
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="mobile-filter"
                        checked={filterMobileOnly}
                        onCheckedChange={setFilterMobileOnly}
                      />
                      <Label htmlFor="mobile-filter" className="text-sm flex items-center gap-1.5">
                        📱 Apenas Celulares
                      </Label>
                    </div>
                  </div>
                  
                  {/* Category filter */}
                  <div className="flex items-center gap-3">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select value={filterCategory} onValueChange={setFilterCategory}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Filtrar por categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as categorias</SelectItem>
                        {categories.length > 0 ? (
                          categories.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>Sem categorias disponíveis</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>

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

              <div className="flex flex-wrap gap-2 pt-2">
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
                  CSV
                </Button>
                {(combinedResults.length > 0 || persistedResults.length > 0) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clearPersistedResults}
                    title="Limpar resultados salvos"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              
              {/* Clear cache option */}
              {combinedResults.length > 0 && (
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={clearDatabaseCache}
                    className="text-xs text-muted-foreground"
                  >
                    Limpar cache do banco
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {isLoading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div className="text-center space-y-1">
                  <p className="font-medium">Buscando no Google Maps...</p>
                  <p className="text-sm text-muted-foreground">
                    {mapsProgress.currentCity}
                  </p>
                  {combinedResults.length > 0 && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-2 flex items-center justify-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {combinedResults.length} lead{combinedResults.length !== 1 ? 's' : ''} encontrado{combinedResults.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-center gap-4 mt-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Globe className="h-3 w-3 text-blue-500" />
                      Serper: {apiUsage.serper}
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3 text-purple-500" />
                      Cache: {apiUsage.cache}
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
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
                <div>
                  <p className="font-medium text-destructive">Erro na busca</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search Stats Dashboard */}
        {filteredResults.length > 0 && !isLoading && (
          <SearchStats 
            results={filteredResults} 
            apiUsage={apiUsage}
            searchDuration={searchDuration}
          />
        )}

        {(filteredResults.length > 0 || isLoading) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resultados
                {filteredResults.filter(r => (r.score || 0) >= 4).length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    <Star className="h-3 w-3 mr-1 text-yellow-500" />
                    {filteredResults.filter(r => (r.score || 0) >= 4).length} alta qualidade
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {filteredResults.length} lead{filteredResults.length !== 1 ? 's' : ''} 
                {combinedResults.length !== filteredResults.length && ` (de ${combinedResults.length} total)`}
                {isLoading && ' (buscando mais...)'}
              </CardDescription>
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

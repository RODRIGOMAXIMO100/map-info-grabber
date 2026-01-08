import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business, Location } from '@/types/business';

interface SearchResult {
  success: boolean;
  data?: Business[];
  error?: string;
  errorCode?: string;
  apiUsed?: string;
}

interface Progress {
  current: number;
  total: number;
  currentCity: string;
}

export interface ApiUsageStats {
  serper: number;
  cache: number;
  enriched: number;
}

// Limit concurrent requests
const MAX_CONCURRENT = 3;

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
  onProgress?: (completed: number, total: number) => void
): Promise<T[]> {
  const results: T[] = [];
  let completed = 0;
  
  const executeTask = async (task: () => Promise<T>): Promise<T> => {
    const result = await task();
    completed++;
    onProgress?.(completed, tasks.length);
    return result;
  };

  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map(task => executeTask(task)));
    results.push(...batchResults);
  }

  return results;
}

function generateCacheKey(keyword: string, city: string, state: string, maxResults: number): string {
  return `serper_${keyword.toLowerCase().trim()}_${city.toLowerCase()}_${state}_${maxResults}`;
}

export function useBusinessSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, currentCity: '' });
  const [apiUsage, setApiUsage] = useState<ApiUsageStats>({ serper: 0, cache: 0, enriched: 0 });
  const abortController = useRef<AbortController | null>(null);

  // Search a single location using Serper
  const searchLocation = async (
    keyword: string, 
    location: Location, 
    maxResults: number,
    useEnrichment: boolean
  ): Promise<Business[]> => {
    
    console.log(`[Serper] Searching ${location.city}`);
    const { data, error: apiError } = await supabase.functions.invoke<SearchResult>('search-businesses-serpapi', {
      body: { keyword, locations: [location], maxResults },
    });

    if (apiError) {
      console.error(`[Serper] API error:`, apiError);
      throw new Error(apiError.message || 'Erro na API Serper');
    }

    if (data?.errorCode === 'NO_CREDITS' || data?.errorCode === 'NO_API_KEY') {
      throw new Error('Serper sem créditos ou chave inválida. Verifique sua API key.');
    }

    if (data?.errorCode === 'RATE_LIMIT') {
      throw new Error('Limite de requisições Serper atingido. Aguarde um momento.');
    }

    if (!data?.success) {
      console.error(`[Serper] Error:`, data?.error);
      return [];
    }

    const results = data.data || [];
    console.log(`[Serper] Found ${results.length} results for ${location.city}`);

    // Optionally enrich with Firecrawl
    if (useEnrichment && results.length > 0) {
      return await enrichResults(results);
    }

    return results;
  };

  // Enrich results using Firecrawl
  const enrichResults = async (businesses: Business[]): Promise<Business[]> => {
    // Only enrich businesses that have websites but missing Instagram/email
    const toEnrich = businesses.filter(b => 
      b.website && (!b.instagram || !b.email)
    ).slice(0, 20); // Limit to 20 to save Firecrawl credits

    if (toEnrich.length === 0) return businesses;

    console.log(`[Serper] Enriching ${toEnrich.length} businesses with Firecrawl`);

    try {
      const { data } = await supabase.functions.invoke('enrich-business', {
        body: { 
          businesses: toEnrich.map(b => ({ 
            name: b.name, 
            website: b.website,
            phone: b.phone 
          })),
          useFirecrawl: true 
        },
      });

      if (data?.success && data.data) {
        // Merge enriched data back
        const enrichedMap = new Map(
          (data.data as Array<{ name: string; instagram?: string; email?: string; whatsapp?: string }>)
            .map((e) => [e.name, e])
        );
        
        return businesses.map(b => {
          const enriched = enrichedMap.get(b.name);
          if (enriched) {
            return {
              ...b,
              instagram: enriched.instagram || b.instagram,
              email: enriched.email || b.email,
              whatsapp: enriched.whatsapp || b.whatsapp,
            };
          }
          return b;
        });
      }
    } catch (err) {
      console.error('[Serper] Enrichment error:', err);
    }

    return businesses;
  };

  const search = async (
    keyword: string, 
    locations: Location[], 
    maxResultsPerCity: number = 20, 
    totalMax: number = 100,
    useEnrichment: boolean = false
  ) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setApiUsage({ serper: 0, cache: 0, enriched: 0 });
    abortController.current = new AbortController();
    
    const totalLocations = locations.length;
    setProgress({ current: 0, total: totalLocations, currentCity: 'Verificando cache...' });

    const usage: ApiUsageStats = { serper: 0, cache: 0, enriched: 0 };

    try {
      const allResults: Business[] = [];
      const tasksToFetch: { location: Location; cacheKey: string }[] = [];

      // Check cache for each location
      const cacheChecks = locations.map(async (location) => {
        const cacheKey = generateCacheKey(keyword, location.city, location.state, maxResultsPerCity);
        
        const { data: cached } = await supabase
          .from('search_cache')
          .select('results, result_count')
          .eq('cache_key', cacheKey)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (cached && cached.results) {
          return { location, cached: cached.results as unknown as Business[], cacheKey };
        }
        return { location, cached: null, cacheKey };
      });

      const cacheResults = await Promise.all(cacheChecks);
      
      // Process cached results
      for (const { location, cached, cacheKey } of cacheResults) {
        if (allResults.length >= totalMax) break;
        
        if (cached) {
          console.log(`[Serper] Cache hit for ${location.city}`);
          const remaining = totalMax - allResults.length;
          const resultsToAdd = (cached as unknown as Business[]).slice(0, remaining);
          allResults.push(...resultsToAdd);
          usage.cache++;
        } else {
          tasksToFetch.push({ location, cacheKey });
        }
      }

      // Update with cached results
      if (allResults.length > 0) {
        setResults(allResults.slice(0, totalMax));
        setApiUsage({ ...usage });
      }
      
      if (allResults.length >= totalMax) {
        console.log(`[Serper] Limit reached with cache: ${allResults.length}`);
        setResults(allResults.slice(0, totalMax));
        return;
      }

      // Fetch non-cached locations
      if (tasksToFetch.length > 0) {
        setProgress({ 
          current: cacheResults.length - tasksToFetch.length, 
          total: totalLocations, 
          currentCity: `Buscando ${tasksToFetch.length} cidade(s)...` 
        });

        const fetchTasks = tasksToFetch.map(({ location, cacheKey }) => async () => {
          if (abortController.current?.signal.aborted) return [];
          if (allResults.length >= totalMax) return [];
          
          setProgress(prev => ({ 
            ...prev, 
            currentCity: `${location.city}, ${location.state}` 
          }));

          try {
            const locationResults = await searchLocation(
              keyword, 
              location, 
              maxResultsPerCity,
              useEnrichment
            );

            // Update usage stats
            usage.serper++;
            setApiUsage({ ...usage });

            // Cache results if we got any
            if (locationResults.length > 0) {
              supabase.from('search_cache').insert({
                cache_key: cacheKey,
                search_type: 'serper',
                keyword: keyword.toLowerCase().trim(),
                city: location.city,
                state: location.state,
                results: locationResults as any,
                result_count: locationResults.length,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              }).then(() => console.log(`[Serper] Cached ${location.city} (${locationResults.length} results)`));
            }

            return locationResults;
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[Serper] Error for ${location.city}:`, message);
            setError(message);
            return [];
          }
        });

        const fetchedResults = await runWithConcurrency(
          fetchTasks, 
          MAX_CONCURRENT,
          (completed, total) => {
            setProgress(prev => ({
              ...prev,
              current: (cacheResults.length - tasksToFetch.length) + completed,
            }));
          }
        );

        // Add fetched results
        for (const cityResults of fetchedResults) {
          if (allResults.length >= totalMax) break;
          
          const remaining = totalMax - allResults.length;
          const resultsToAdd = cityResults.slice(0, remaining);
          allResults.push(...resultsToAdd);
          setResults([...allResults]);
        }
      }

      setResults(allResults.slice(0, totalMax));
      setApiUsage({ ...usage });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Serper] Search cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('[Serper] Search error:', err);
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0, currentCity: '' });
    }
  };

  const cancel = () => {
    abortController.current?.abort();
    setIsLoading(false);
  };

  return { search, cancel, results, isLoading, error, progress, apiUsage };
}

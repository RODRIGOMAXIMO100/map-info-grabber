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
  apiUsed?: string;
}

export type ApiSource = 'serpapi' | 'outscraper' | 'cache';

export interface ApiUsageStats {
  serpapi: number;
  outscraper: number;
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
  return `maps_${keyword.toLowerCase().trim()}_${city.toLowerCase()}_${state}_${maxResults}`;
}

export function useBusinessSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, currentCity: '' });
  const [apiUsage, setApiUsage] = useState<ApiUsageStats>({ serpapi: 0, outscraper: 0, cache: 0, enriched: 0 });
  const abortController = useRef<AbortController | null>(null);

  // Search a single location with API fallback
  const searchLocation = async (
    keyword: string, 
    location: Location, 
    maxResults: number,
    useEnrichment: boolean
  ): Promise<{ results: Business[]; api: ApiSource }> => {
    
    // 1. Try SerpAPI first (100 free/month)
    console.log(`[MultiAPI] Trying SerpAPI for ${location.city}`);
    const { data: serpData, error: serpError } = await supabase.functions.invoke<SearchResult>('search-businesses-serpapi', {
      body: { keyword, locations: [location], maxResults },
    });

    if (serpData?.success && serpData.data && serpData.data.length > 0) {
      console.log(`[MultiAPI] SerpAPI success: ${serpData.data.length} results`);
      
      // Optionally enrich with Firecrawl
      if (useEnrichment && serpData.data.length > 0) {
        const enriched = await enrichResults(serpData.data);
        return { results: enriched, api: 'serpapi' };
      }
      
      return { results: serpData.data, api: 'serpapi' };
    }

    const serpNoCredits = serpData?.errorCode === 'NO_CREDITS' || serpData?.errorCode === 'NO_API_KEY';
    if (serpNoCredits) {
      console.log('[MultiAPI] SerpAPI sem créditos, tentando Outscraper básico...');
    }

    // 2. Fallback to Outscraper WITHOUT enrichment (500 free/month)
    console.log(`[MultiAPI] Trying Outscraper (basic) for ${location.city}`);
    const { data: outData, error: outError } = await supabase.functions.invoke<SearchResult>('search-businesses', {
      body: { keyword, locations: [location], maxResults },
    });

    if (outData?.success && outData.data && outData.data.length > 0) {
      console.log(`[MultiAPI] Outscraper success: ${outData.data.length} results`);
      
      // Optionally enrich with Firecrawl
      if (useEnrichment && outData.data.length > 0) {
        const enriched = await enrichResults(outData.data);
        return { results: enriched, api: 'outscraper' };
      }
      
      return { results: outData.data, api: 'outscraper' };
    }

    const outNoCredits = outData?.errorCode === 'NO_CREDITS';
    if (outNoCredits) {
      console.log('[MultiAPI] Outscraper também sem créditos');
      throw new Error('Todas as APIs estão sem créditos. Verifique SerpAPI e Outscraper.');
    }

    // No results from either API
    console.log(`[MultiAPI] No results for ${location.city} from any API`);
    return { results: [], api: 'outscraper' };
  };

  // Enrich results using Firecrawl
  const enrichResults = async (businesses: Business[]): Promise<Business[]> => {
    // Only enrich businesses that have websites but missing Instagram/email
    const toEnrich = businesses.filter(b => 
      b.website && (!b.instagram || !b.email)
    ).slice(0, 20); // Limit to 20 to save Firecrawl credits

    if (toEnrich.length === 0) return businesses;

    console.log(`[MultiAPI] Enriching ${toEnrich.length} businesses with Firecrawl`);

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
      console.error('[MultiAPI] Enrichment error:', err);
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
    setApiUsage({ serpapi: 0, outscraper: 0, cache: 0, enriched: 0 });
    abortController.current = new AbortController();
    
    const totalLocations = locations.length;
    setProgress({ current: 0, total: totalLocations, currentCity: 'Verificando cache...' });

    const usage: ApiUsageStats = { serpapi: 0, outscraper: 0, cache: 0, enriched: 0 };

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
          console.log(`[MultiAPI] Cache hit for ${location.city}`);
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
        console.log(`[MultiAPI] Limit reached with cache: ${allResults.length}`);
        setResults(allResults.slice(0, totalMax));
        return;
      }

      // Fetch non-cached locations with fallback
      if (tasksToFetch.length > 0) {
        setProgress({ 
          current: cacheResults.length - tasksToFetch.length, 
          total: totalLocations, 
          currentCity: `Buscando ${tasksToFetch.length} cidade(s)...` 
        });

        const fetchTasks = tasksToFetch.map(({ location, cacheKey }) => async () => {
          if (abortController.current?.signal.aborted) return { results: [], api: 'cache' as ApiSource };
          if (allResults.length >= totalMax) return { results: [], api: 'cache' as ApiSource };
          
          setProgress(prev => ({ 
            ...prev, 
            currentCity: `${location.city}, ${location.state}` 
          }));

          try {
            const { results: locationResults, api } = await searchLocation(
              keyword, 
              location, 
              maxResultsPerCity,
              useEnrichment
            );

            // Update usage stats
            if (api === 'serpapi') usage.serpapi++;
            else if (api === 'outscraper') usage.outscraper++;
            setApiUsage({ ...usage });

            // Cache results if we got any
            if (locationResults.length > 0) {
              supabase.from('search_cache').insert({
                cache_key: cacheKey,
                search_type: 'google_maps',
                keyword: keyword.toLowerCase().trim(),
                city: location.city,
                state: location.state,
                results: locationResults as any,
                result_count: locationResults.length,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              }).then(() => console.log(`[MultiAPI] Cached ${location.city} (${locationResults.length} results)`));
            }

            return { results: locationResults, api };
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[MultiAPI] Error for ${location.city}:`, message);
            
            // If all APIs are out of credits, set error and abort
            if (message.includes('Todas as APIs')) {
              setError(message);
              abortController.current?.abort();
            }
            
            return { results: [], api: 'cache' as ApiSource };
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
        for (const { results: cityResults } of fetchedResults) {
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
        console.log('[MultiAPI] Search cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('[MultiAPI] Search error:', err);
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

import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business, Location } from '@/types/business';

interface SearchResult {
  success: boolean;
  data?: Business[];
  error?: string;
}

interface CacheResult {
  cache_key: string;
  results: Business[];
  result_count: number;
}

interface Progress {
  current: number;
  total: number;
  currentCity: string;
}

// Limit concurrent requests to avoid overwhelming the API
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

  // Process in batches
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
  const abortController = useRef<AbortController | null>(null);

  const search = async (keyword: string, locations: Location[], maxResults: number = 20) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    abortController.current = new AbortController();
    
    const totalLocations = locations.length;
    setProgress({ current: 0, total: totalLocations, currentCity: 'Verificando cache...' });

    try {
      const allResults: Business[] = [];
      const tasksToFetch: { location: Location; cacheKey: string }[] = [];

      // Check cache for each location in parallel
      const cacheChecks = locations.map(async (location) => {
        const cacheKey = generateCacheKey(keyword, location.city, location.state, maxResults);
        
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
      
      // Separate cached and non-cached
      for (const { location, cached, cacheKey } of cacheResults) {
        if (cached) {
          console.log(`Cache hit for ${location.city}, ${location.state}`);
          allResults.push(...(cached as unknown as Business[]));
        } else {
          tasksToFetch.push({ location, cacheKey });
        }
      }

      // Update results with cached data immediately
      if (allResults.length > 0) {
        setResults(allResults);
      }

      // Fetch non-cached locations in parallel with concurrency limit
      if (tasksToFetch.length > 0) {
        setProgress({ 
          current: cacheResults.length - tasksToFetch.length, 
          total: totalLocations, 
          currentCity: `Buscando ${tasksToFetch.length} cidade(s)...` 
        });

        const fetchTasks = tasksToFetch.map(({ location, cacheKey }) => async () => {
          setProgress(prev => ({ 
            ...prev, 
            currentCity: `${location.city}, ${location.state}` 
          }));

          const { data, error: fnError } = await supabase.functions.invoke<SearchResult>('search-businesses', {
            body: { keyword, locations: [location], maxResults },
          });

          if (fnError) {
            console.error(`Error for ${location.city}:`, fnError);
            return [];
          }

          if (data?.success && data.data) {
            // Save to cache (don't await)
            supabase.from('search_cache').insert({
              cache_key: cacheKey,
              search_type: 'google_maps',
              keyword: keyword.toLowerCase().trim(),
              city: location.city,
              state: location.state,
              results: data.data as any,
              result_count: data.data.length,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }).then(() => console.log(`Cached ${location.city}`));

            return data.data;
          }
          
          return [];
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
          allResults.push(...cityResults);
          // Update results progressively
          setResults([...allResults]);
        }
      }

      setResults(allResults);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Search cancelled');
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0, currentCity: '' });
    }
  };

  const cancel = () => {
    abortController.current?.abort();
    setIsLoading(false);
  };

  return { search, cancel, results, isLoading, error, progress };
}

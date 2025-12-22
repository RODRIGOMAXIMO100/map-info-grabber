import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Location } from '@/types/business';

export interface InstagramResult {
  name: string;
  username: string;
  profileUrl: string;
  bio?: string;
  city: string;
  state: string;
  source: 'instagram';
  whatsapp?: string;
  instagram?: string;
  phone?: string;
  score: number;
}

interface SearchResult {
  success: boolean;
  data?: InstagramResult[];
  error?: string;
}

interface ScrapeResult {
  success: boolean;
  results?: Array<{
    url: string;
    whatsapp: string | null;
    phone: string | null;
    instagram: string | null;
    success: boolean;
  }>;
}

interface Progress {
  current: number;
  total: number;
  currentCity: string;
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
  return `ig_${keyword.toLowerCase().trim()}_${city.toLowerCase()}_${state}_${maxResults}`;
}

export function useInstagramSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<InstagramResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, currentCity: '' });
  const [isScraping, setIsScraping] = useState(false);

  const search = async (keyword: string, locations: Location[], maxResults: number = 20) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    
    const totalLocations = locations.length;
    setProgress({ current: 0, total: totalLocations, currentCity: 'Verificando cache...' });

    try {
      const allResults: InstagramResult[] = [];
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
          return { location, cached: cached.results as unknown as InstagramResult[], cacheKey };
        }
        return { location, cached: null, cacheKey };
      });

      const cacheResults = await Promise.all(cacheChecks);
      
      // Separate cached and non-cached
      for (const { location, cached, cacheKey } of cacheResults) {
        if (cached) {
          console.log(`Cache hit for IG ${location.city}, ${location.state}`);
          allResults.push(...(cached as unknown as InstagramResult[]));
        } else {
          tasksToFetch.push({ location, cacheKey });
        }
      }

      // Update results with cached data immediately
      if (allResults.length > 0) {
        setResults(allResults);
      }

      // Fetch non-cached locations in parallel
      if (tasksToFetch.length > 0) {
        setProgress({ 
          current: cacheResults.length - tasksToFetch.length, 
          total: totalLocations, 
          currentCity: `Buscando perfis no Instagram...` 
        });

        const fetchTasks = tasksToFetch.map(({ location, cacheKey }) => async () => {
          setProgress(prev => ({ 
            ...prev, 
            currentCity: `Instagram: ${location.city}, ${location.state}` 
          }));

          const { data, error: fnError } = await supabase.functions.invoke<SearchResult>('search-instagram', {
            body: { keyword, locations: [location], maxResults },
          });

          if (fnError) {
            console.error(`Error for IG ${location.city}:`, fnError);
            return [];
          }

          if (data?.success && data.data) {
            // Save to cache
            supabase.from('search_cache').insert({
              cache_key: cacheKey,
              search_type: 'instagram',
              keyword: keyword.toLowerCase().trim(),
              city: location.city,
              state: location.state,
              results: data.data as any,
              result_count: data.data.length,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }).then(() => console.log(`Cached IG ${location.city}`));

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
          setResults([...allResults]);
        }
      }

      // Auto-scrape profiles without WhatsApp using Firecrawl
      const profilesToScrape = allResults.filter(r => !r.whatsapp && r.profileUrl);
      
      if (profilesToScrape.length > 0) {
        setProgress({ 
          current: totalLocations, 
          total: totalLocations, 
          currentCity: `Extraindo WhatsApp de ${profilesToScrape.length} perfis...` 
        });
        
        setIsScraping(true);
        const scraped = await scrapeProfiles(profilesToScrape.map(p => p.profileUrl));
        setIsScraping(false);
        
        if (scraped?.results) {
          // Update results with scraped data
          const updatedResults = allResults.map(result => {
            const scrapedData = scraped.results?.find(s => s.url === result.profileUrl);
            if (scrapedData && scrapedData.success) {
              const newScore = calculateUpdatedScore(result, scrapedData);
              return {
                ...result,
                whatsapp: scrapedData.whatsapp || result.whatsapp,
                phone: scrapedData.phone || result.phone,
                score: newScore,
              };
            }
            return result;
          });
          
          setResults(updatedResults);
        }
      }

      setResults(allResults);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Instagram search error:', err);
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0, currentCity: '' });
    }
  };

  const scrapeProfiles = async (urls: string[]): Promise<ScrapeResult | null> => {
    if (urls.length === 0) return null;
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke<ScrapeResult>('scrape-whatsapp', {
        body: { urls },
      });

      if (fnError) {
        console.error('Error scraping profiles:', fnError);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Scrape error:', err);
      return null;
    }
  };

  // Calculate updated score after scraping
  const calculateUpdatedScore = (
    result: InstagramResult, 
    scrapedData: { whatsapp: string | null; phone: string | null }
  ): number => {
    let score = result.score || 0;
    
    if (scrapedData.whatsapp) {
      // wa.me link confirmed = highest score
      if (scrapedData.whatsapp.includes('wa.me')) {
        score = 5;
      } else {
        score = Math.max(score, 4);
      }
    } else if (scrapedData.phone) {
      // Phone found but not WhatsApp
      const cleanPhone = scrapedData.phone.replace(/\D/g, '');
      // Check if it's a mobile (starts with 9 after DDD)
      if (cleanPhone.length >= 10) {
        const afterDDD = cleanPhone.slice(-9);
        if (afterDDD.startsWith('9')) {
          score = Math.max(score, 4); // Mobile = likely WhatsApp
        } else {
          score = Math.max(score, 3); // Landline
        }
      }
    }
    
    return score;
  };

  return { 
    search, 
    scrapeProfiles, 
    results, 
    isLoading: isLoading || isScraping, 
    isScraping,
    error, 
    progress 
  };
}

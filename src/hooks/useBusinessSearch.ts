import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business, Location } from '@/types/business';

interface SearchResult {
  success: boolean;
  data?: Business[];
  error?: string;
}

interface Progress {
  current: number;
  total: number;
  currentCity: string;
}

export function useBusinessSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, currentCity: '' });

  const search = async (keyword: string, locations: Location[]) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: locations.length, currentCity: '' });

    try {
      for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        setProgress({ 
          current: i + 1, 
          total: locations.length, 
          currentCity: `${location.city}, ${location.state}` 
        });

        const { data, error: fnError } = await supabase.functions.invoke<SearchResult>('search-businesses', {
          body: { keyword, locations: [location] },
        });

        if (fnError) {
          console.error(`Error for ${location.city}:`, fnError);
          continue;
        }

        if (data?.success && data.data) {
          setResults(prev => [...prev, ...data.data]);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0, currentCity: '' });
    }
  };

  return { search, results, isLoading, error, progress };
}

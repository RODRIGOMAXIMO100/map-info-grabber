import { useState } from 'react';
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

interface Progress {
  current: number;
  total: number;
  currentCity: string;
}

export function useInstagramSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<InstagramResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ current: 0, total: 0, currentCity: '' });

  const search = async (keyword: string, locations: Location[], maxResults: number = 20) => {
    setIsLoading(true);
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: locations.length, currentCity: '' });

    try {
      // Search all locations at once
      setProgress({ 
        current: 1, 
        total: locations.length, 
        currentCity: 'Buscando perfis no Instagram...' 
      });

      const { data, error: fnError } = await supabase.functions.invoke<SearchResult>('search-instagram', {
        body: { keyword, locations, maxResults },
      });

      if (fnError) {
        console.error('Error searching Instagram:', fnError);
        setError(fnError.message);
        return;
      }

      if (data?.success && data.data) {
        setResults(data.data);
      } else if (data?.error) {
        setError(data.error);
      }

      setProgress({ current: locations.length, total: locations.length, currentCity: '' });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Instagram search error:', err);
    } finally {
      setIsLoading(false);
      setProgress({ current: 0, total: 0, currentCity: '' });
    }
  };

  const scrapeProfiles = async (urls: string[]) => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('scrape-whatsapp', {
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

  return { search, scrapeProfiles, results, isLoading, error, progress };
}

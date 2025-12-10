import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Business, Location } from '@/types/business';

interface SearchResult {
  success: boolean;
  data?: Business[];
  error?: string;
}

export function useBusinessSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<Business[]>([]);
  const [error, setError] = useState<string | null>(null);

  const search = async (keyword: string, locations: Location[]) => {
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const { data, error: fnError } = await supabase.functions.invoke<SearchResult>('search-businesses', {
        body: { keyword, locations },
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Erro ao buscar empresas');
      }

      setResults(data.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return { search, results, isLoading, error };
}

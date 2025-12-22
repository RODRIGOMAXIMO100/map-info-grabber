-- Create search cache table for storing and reusing recent search results
CREATE TABLE public.search_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  search_type TEXT NOT NULL CHECK (search_type IN ('google_maps', 'instagram')),
  keyword TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days')
);

-- Create index for fast lookups
CREATE INDEX idx_search_cache_key ON public.search_cache(cache_key);
CREATE INDEX idx_search_cache_expires ON public.search_cache(expires_at);

-- Enable RLS
ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

-- Allow public access for caching (no auth required)
CREATE POLICY "Allow all access to search_cache" 
ON public.search_cache 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION public.clean_expired_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.search_cache WHERE expires_at < now();
END;
$$;
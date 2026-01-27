-- Limpar entradas com search_type inválido
DELETE FROM public.search_cache 
WHERE search_type NOT IN ('google_maps', 'instagram');

-- Remover constraint antiga (se existir)
ALTER TABLE public.search_cache 
DROP CONSTRAINT IF EXISTS search_cache_search_type_check;

-- Adicionar constraint corrigida
ALTER TABLE public.search_cache 
ADD CONSTRAINT search_cache_search_type_check 
CHECK (search_type IN ('google_maps', 'instagram'));
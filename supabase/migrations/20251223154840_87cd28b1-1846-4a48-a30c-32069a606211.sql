-- 1. Adicionar novas colunas em whatsapp_ai_config
ALTER TABLE public.whatsapp_ai_config 
ADD COLUMN IF NOT EXISTS persona_name text,
ADD COLUMN IF NOT EXISTS offer_description text,
ADD COLUMN IF NOT EXISTS target_audience text,
ADD COLUMN IF NOT EXISTS tone text DEFAULT 'profissional';

-- 2. Migrar dados do DNA ativo para whatsapp_ai_config
UPDATE public.whatsapp_ai_config 
SET 
  persona_name = (SELECT persona_name FROM public.ai_dnas WHERE is_active = true LIMIT 1),
  offer_description = (SELECT offer_description FROM public.ai_dnas WHERE is_active = true LIMIT 1),
  target_audience = (SELECT target_audience FROM public.ai_dnas WHERE is_active = true LIMIT 1),
  tone = (SELECT tone FROM public.ai_dnas WHERE is_active = true LIMIT 1),
  system_prompt = COALESCE(
    (SELECT system_prompt FROM public.ai_dnas WHERE is_active = true LIMIT 1),
    system_prompt
  ),
  video_url = COALESCE(
    (SELECT video_url FROM public.ai_dnas WHERE is_active = true LIMIT 1),
    video_url
  ),
  site_url = COALESCE(
    (SELECT site_url FROM public.ai_dnas WHERE is_active = true LIMIT 1),
    site_url
  ),
  payment_link = COALESCE(
    (SELECT payment_link FROM public.ai_dnas WHERE is_active = true LIMIT 1),
    payment_link
  );

-- 3. Remover coluna default_dna_id de whatsapp_ai_config
ALTER TABLE public.whatsapp_ai_config DROP COLUMN IF EXISTS default_dna_id;

-- 4. Remover coluna dna_id de whatsapp_conversations
ALTER TABLE public.whatsapp_conversations DROP COLUMN IF EXISTS dna_id;

-- 5. Remover coluna dna_id de broadcast_lists (se existir FK)
ALTER TABLE public.broadcast_lists DROP CONSTRAINT IF EXISTS broadcast_lists_dna_id_fkey;
ALTER TABLE public.broadcast_lists DROP COLUMN IF EXISTS dna_id;

-- 6. Dropar tabela ai_dnas
DROP TABLE IF EXISTS public.ai_dnas CASCADE;
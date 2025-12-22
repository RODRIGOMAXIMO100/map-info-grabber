-- Adicionar coluna default_dna_id na tabela whatsapp_ai_config
ALTER TABLE public.whatsapp_ai_config 
ADD COLUMN IF NOT EXISTS default_dna_id uuid REFERENCES public.ai_dnas(id) ON DELETE SET NULL;
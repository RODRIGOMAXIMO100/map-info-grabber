-- Deletar prompts que tenham dna_id preenchido (manter apenas os genéricos)
DELETE FROM public.ai_stage_prompts WHERE dna_id IS NOT NULL;

-- Remover a coluna dna_id da tabela
ALTER TABLE public.ai_stage_prompts DROP COLUMN IF EXISTS dna_id;
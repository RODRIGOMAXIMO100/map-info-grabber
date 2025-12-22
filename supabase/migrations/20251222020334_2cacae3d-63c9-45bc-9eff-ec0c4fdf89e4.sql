-- Adicionar coluna para armazenar BANT score na tabela de logs
ALTER TABLE public.whatsapp_ai_logs 
ADD COLUMN IF NOT EXISTS bant_score jsonb DEFAULT NULL;
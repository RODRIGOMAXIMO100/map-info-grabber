-- Adicionar coluna para rastrear quem criou o lembrete
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN reminder_created_by uuid REFERENCES auth.users(id);

-- Criar índice para melhorar performance de consultas
CREATE INDEX idx_conversations_reminder_created_by 
ON public.whatsapp_conversations(reminder_created_by);
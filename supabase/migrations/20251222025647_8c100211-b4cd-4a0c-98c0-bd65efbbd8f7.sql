-- Adicionar colunas para controle de follow-up
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS last_followup_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS followup_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_lead_message_at timestamp with time zone DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.whatsapp_conversations.last_followup_at IS 'Data/hora do último follow-up enviado';
COMMENT ON COLUMN public.whatsapp_conversations.followup_count IS 'Quantidade de follow-ups enviados';
COMMENT ON COLUMN public.whatsapp_conversations.last_lead_message_at IS 'Data/hora da última mensagem recebida do lead';
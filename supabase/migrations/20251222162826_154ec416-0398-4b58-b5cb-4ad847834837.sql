-- Adicionar campo is_crm_lead para marcar definitivamente quem é lead do CRM/funil
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS is_crm_lead boolean DEFAULT false;

-- Marcar como CRM lead todas as conversas que já têm dna_id (vieram do broadcast)
UPDATE public.whatsapp_conversations 
SET is_crm_lead = true 
WHERE dna_id IS NOT NULL;

-- Criar índice para consultas eficientes
CREATE INDEX IF NOT EXISTS idx_conversations_is_crm_lead 
ON public.whatsapp_conversations(is_crm_lead);

-- Comentário explicativo
COMMENT ON COLUMN public.whatsapp_conversations.is_crm_lead IS 'True se o lead veio do sistema de broadcast/CRM. A IA só responde leads com is_crm_lead=true.';
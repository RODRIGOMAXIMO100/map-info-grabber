-- Adicionar campos de cidade e estado do lead na tabela de conversas
ALTER TABLE whatsapp_conversations 
  ADD COLUMN IF NOT EXISTS lead_city TEXT,
  ADD COLUMN IF NOT EXISTS lead_state TEXT;

COMMENT ON COLUMN whatsapp_conversations.lead_city IS 'Cidade do lead (origem do broadcast)';
COMMENT ON COLUMN whatsapp_conversations.lead_state IS 'Estado do lead (origem do broadcast)';
-- Adicionar coluna closed_value para valor real de venda fechada
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS closed_value NUMERIC DEFAULT NULL;

COMMENT ON COLUMN whatsapp_conversations.closed_value IS 
'Valor real da venda quando o lead é movido para FECHADO';
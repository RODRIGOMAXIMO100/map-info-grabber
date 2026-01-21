-- Remover constraint antiga
ALTER TABLE whatsapp_conversations DROP CONSTRAINT IF EXISTS check_origin;

-- Adicionar nova constraint com webhook incluído
ALTER TABLE whatsapp_conversations 
ADD CONSTRAINT check_origin 
CHECK (origin IN ('broadcast', 'random', 'test', 'webhook'));
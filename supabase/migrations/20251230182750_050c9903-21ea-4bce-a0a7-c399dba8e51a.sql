-- Remover constraint antiga
ALTER TABLE whatsapp_conversations 
DROP CONSTRAINT IF EXISTS check_origin;

-- Criar nova constraint com 'test' incluído
ALTER TABLE whatsapp_conversations 
ADD CONSTRAINT check_origin 
CHECK (origin = ANY (ARRAY['broadcast', 'random', 'test']));
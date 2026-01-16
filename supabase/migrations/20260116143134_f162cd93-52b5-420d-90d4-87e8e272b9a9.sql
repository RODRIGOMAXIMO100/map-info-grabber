-- O problema é que as políticas INSERT/DELETE restritivas podem estar interferindo
-- Vamos também simplificar a política de INSERT para não bloquear updates

-- Remover política de INSERT restritiva
DROP POLICY IF EXISTS "Users can insert own assigned conversations" ON whatsapp_conversations;

-- Criar política de INSERT que permite qualquer autenticado inserir
CREATE POLICY "Any authenticated user can insert conversations"
ON whatsapp_conversations
FOR INSERT
TO authenticated
WITH CHECK (true);
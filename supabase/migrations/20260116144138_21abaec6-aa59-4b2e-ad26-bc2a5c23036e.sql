-- Criar política SELECT permissiva para permitir que qualquer usuário autenticado veja qualquer conversa
CREATE POLICY "Any authenticated user can select conversations"
ON whatsapp_conversations
FOR SELECT
TO authenticated
USING (true);

-- Remover políticas SELECT antigas que eram restritivas
DROP POLICY IF EXISTS "Users can view assigned conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Unassigned conversations visible to all" ON whatsapp_conversations;
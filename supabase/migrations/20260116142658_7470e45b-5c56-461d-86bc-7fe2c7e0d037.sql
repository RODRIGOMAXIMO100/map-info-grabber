-- Deletar políticas de UPDATE existentes que podem estar causando conflito
DROP POLICY IF EXISTS "Authenticated users can update conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Users can self-assign unassigned conversations" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Team members can update any conversation" ON whatsapp_conversations;

-- Criar política única e clara: qualquer usuário autenticado pode atualizar qualquer conversa
CREATE POLICY "Any authenticated user can update any conversation"
ON whatsapp_conversations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
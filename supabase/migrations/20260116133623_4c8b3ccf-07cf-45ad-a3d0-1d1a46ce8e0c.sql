-- Remove a policy restritiva que exige role de team member
DROP POLICY IF EXISTS "Team members can update any conversation" ON whatsapp_conversations;

-- Cria policy simples: qualquer usuário autenticado pode atualizar qualquer conversa
CREATE POLICY "Authenticated users can update conversations"
ON whatsapp_conversations
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
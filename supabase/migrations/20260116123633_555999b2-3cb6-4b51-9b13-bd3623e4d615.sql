-- Remover a política atual que não permite transferência
DROP POLICY IF EXISTS "Users can access assigned conversations" ON whatsapp_conversations;

-- Criar nova política para SELECT (usuário vê seus leads atribuídos)
CREATE POLICY "Users can view assigned conversations"
ON whatsapp_conversations
FOR SELECT
TO authenticated
USING (assigned_to = auth.uid());

-- Criar nova política para UPDATE (usuário pode atualizar seus leads E transferir para outros)
CREATE POLICY "Users can update and transfer assigned conversations"
ON whatsapp_conversations
FOR UPDATE
TO authenticated
USING (assigned_to = auth.uid())
WITH CHECK (true);

-- Manter INSERT apenas para próprios leads
CREATE POLICY "Users can insert own assigned conversations"
ON whatsapp_conversations
FOR INSERT
TO authenticated
WITH CHECK (assigned_to = auth.uid());

-- Manter DELETE apenas para próprios leads
CREATE POLICY "Users can delete own assigned conversations"
ON whatsapp_conversations
FOR DELETE
TO authenticated
USING (assigned_to = auth.uid());
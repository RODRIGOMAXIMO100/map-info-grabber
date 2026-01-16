-- Remover policies redundantes de UPDATE
DROP POLICY IF EXISTS "Admins can update any conversation" ON whatsapp_conversations;
DROP POLICY IF EXISTS "Users can update and transfer assigned conversations" ON whatsapp_conversations;
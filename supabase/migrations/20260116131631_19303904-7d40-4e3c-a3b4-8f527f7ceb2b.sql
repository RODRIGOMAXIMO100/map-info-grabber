-- Permitir admins atualizarem qualquer conversa (incluindo transferir)
CREATE POLICY "Admins can update any conversation"
  ON whatsapp_conversations
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (true);
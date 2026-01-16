-- Remove the policy with restrictive WITH CHECK that blocks transfers
DROP POLICY IF EXISTS "Users can assign unassigned conversations" ON whatsapp_conversations;

-- Recreate with correct logic: self-assign only for unassigned conversations
CREATE POLICY "Users can self-assign unassigned conversations"
  ON whatsapp_conversations
  FOR UPDATE
  TO authenticated
  USING (assigned_to IS NULL)
  WITH CHECK (assigned_to = auth.uid());
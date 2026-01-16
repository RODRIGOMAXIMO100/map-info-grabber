-- Adicionar coluna assigned_to na tabela broadcast_lists
ALTER TABLE broadcast_lists 
ADD COLUMN assigned_to uuid REFERENCES profiles(user_id);

COMMENT ON COLUMN broadcast_lists.assigned_to IS 'Usuário que receberá automaticamente os leads deste disparo';
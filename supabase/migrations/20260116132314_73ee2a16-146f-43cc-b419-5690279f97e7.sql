-- 1. Criar função helper para verificar se usuário tem papel de equipe
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'sdr', 'closer')
  )
$$;

-- 2. Criar policy que permite qualquer membro da equipe transferir qualquer conversa
CREATE POLICY "Team members can update any conversation"
  ON whatsapp_conversations
  FOR UPDATE
  TO authenticated
  USING (public.is_team_member(auth.uid()))
  WITH CHECK (true);
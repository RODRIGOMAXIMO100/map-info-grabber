-- Permitir que todos os usuários autenticados vejam todos os roles
-- (necessário para o modal de transferência de leads)
CREATE POLICY "Authenticated users can view all roles"
ON user_roles
FOR SELECT
TO authenticated
USING (true);

-- Permitir que todos os usuários autenticados vejam todos os perfis
-- (necessário para exibir nomes no modal de transferência)
CREATE POLICY "Authenticated users can view all profiles"
ON profiles
FOR SELECT
TO authenticated
USING (true);
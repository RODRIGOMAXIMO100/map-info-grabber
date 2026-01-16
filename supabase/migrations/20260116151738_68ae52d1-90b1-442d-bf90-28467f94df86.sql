-- Remover política permissiva antiga que permite acesso total a todos os usuários
DROP POLICY IF EXISTS "Allow all access to crm_funnels" ON public.crm_funnels;
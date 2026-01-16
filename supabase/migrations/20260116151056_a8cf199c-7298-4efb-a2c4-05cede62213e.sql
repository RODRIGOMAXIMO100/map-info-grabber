-- Criar tabela de relacionamento funil-usuário
CREATE TABLE public.crm_funnel_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (funnel_id, user_id)
);

-- Habilitar RLS
ALTER TABLE public.crm_funnel_users ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar tudo
CREATE POLICY "Admins can manage funnel users"
ON public.crm_funnel_users
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Usuários podem ver suas próprias atribuições
CREATE POLICY "Users can view own funnel assignments"
ON public.crm_funnel_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Atualizar RLS de crm_funnels: remover política antiga e criar novas
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.crm_funnels;

-- Admins veem todos os funis
CREATE POLICY "Admins can view all funnels"
ON public.crm_funnels
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Usuários veem apenas funis atribuídos
CREATE POLICY "Users can view assigned funnels"
ON public.crm_funnels
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.crm_funnel_users
        WHERE crm_funnel_users.funnel_id = crm_funnels.id
        AND crm_funnel_users.user_id = auth.uid()
    )
);
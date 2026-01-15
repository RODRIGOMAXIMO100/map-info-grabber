-- =============================================
-- FASE 1: Estrutura de Autenticação Multi-Vendedor
-- =============================================

-- 1.1 Criar enum para papéis
CREATE TYPE public.app_role AS ENUM ('admin', 'sdr', 'closer');

-- 1.2 Criar tabela de perfis
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name text NOT NULL,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now()
);

-- 1.3 Criar tabela de papéis (separada por segurança)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 1.4 Adicionar colunas de atribuição em whatsapp_conversations
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS transferred_by uuid REFERENCES auth.users(id);

-- =============================================
-- FASE 2: Funções SECURITY DEFINER (evitam recursão RLS)
-- =============================================

-- 2.1 Função para verificar se usuário tem um papel específico
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2.2 Função para obter o papel do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 2.3 Trigger para criar perfil automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- FASE 3: RLS Policies
-- =============================================

-- 3.1 RLS para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3.2 RLS para user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 3.3 Atualizar RLS de whatsapp_conversations
-- Primeiro remover política existente de acesso total
DROP POLICY IF EXISTS "Allow all access to whatsapp_conversations" ON public.whatsapp_conversations;

-- Admin vê tudo
CREATE POLICY "Admins can access all conversations"
ON public.whatsapp_conversations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Vendedor vê apenas conversas atribuídas a ele
CREATE POLICY "Users can access assigned conversations"
ON public.whatsapp_conversations FOR ALL
TO authenticated
USING (assigned_to = auth.uid());

-- Conversas não atribuídas são visíveis para todos (para atribuição inicial)
CREATE POLICY "Unassigned conversations visible to all"
ON public.whatsapp_conversations FOR SELECT
TO authenticated
USING (assigned_to IS NULL);

-- Permitir atribuir conversas não atribuídas
CREATE POLICY "Users can assign unassigned conversations"
ON public.whatsapp_conversations FOR UPDATE
TO authenticated
USING (assigned_to IS NULL)
WITH CHECK (assigned_to = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =============================================
-- FASE 4: Habilitar Realtime para profiles
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
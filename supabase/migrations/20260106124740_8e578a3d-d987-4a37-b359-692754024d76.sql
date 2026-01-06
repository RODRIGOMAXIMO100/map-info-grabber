-- Tabela de Funis CRM
CREATE TABLE public.crm_funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;

-- Política de acesso público (sem auth neste projeto)
CREATE POLICY "Allow all access to crm_funnels" ON public.crm_funnels
FOR ALL USING (true) WITH CHECK (true);

-- Tabela de Etapas do Funil
CREATE TABLE public.crm_funnel_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  stage_order INTEGER NOT NULL DEFAULT 0,
  is_ai_controlled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.crm_funnel_stages ENABLE ROW LEVEL SECURITY;

-- Política de acesso público
CREATE POLICY "Allow all access to crm_funnel_stages" ON public.crm_funnel_stages
FOR ALL USING (true) WITH CHECK (true);

-- Adicionar coluna de funil nas conversas
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN crm_funnel_id UUID REFERENCES public.crm_funnels(id) ON DELETE SET NULL;

-- Criar funil padrão com as etapas atuais
INSERT INTO public.crm_funnels (id, name, description, is_default)
VALUES ('00000000-0000-0000-0000-000000000001', 'Funil Padrão', 'Funil principal de vendas', true);

-- Inserir etapas padrão baseadas no CRM_STAGES atual
INSERT INTO public.crm_funnel_stages (funnel_id, name, color, stage_order, is_ai_controlled) VALUES
('00000000-0000-0000-0000-000000000001', 'Lead Novo', '#3b82f6', 0, true),
('00000000-0000-0000-0000-000000000001', 'Qualificando', '#8b5cf6', 1, true),
('00000000-0000-0000-0000-000000000001', 'Apresentação', '#f59e0b', 2, true),
('00000000-0000-0000-0000-000000000001', 'Proposta', '#10b981', 3, false),
('00000000-0000-0000-0000-000000000001', 'Negociação', '#06b6d4', 4, false),
('00000000-0000-0000-0000-000000000001', 'Fechado', '#22c55e', 5, false),
('00000000-0000-0000-0000-000000000001', 'Perdido', '#ef4444', 6, false);

-- Vincular conversas existentes ao funil padrão
UPDATE public.whatsapp_conversations 
SET crm_funnel_id = '00000000-0000-0000-0000-000000000001'
WHERE crm_funnel_id IS NULL;
-- Criar tabela de permissões por role
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  route_key text NOT NULL,
  route_label text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, route_key)
);

-- Habilitar RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Políticas: todos autenticados podem ler, apenas admin pode modificar
CREATE POLICY "Authenticated users can read permissions"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Inserir permissões iniciais para SDR (acesso limitado)
INSERT INTO public.role_permissions (role, route_key, route_label, is_allowed) VALUES
  ('sdr', 'dashboard', 'Dashboard', true),
  ('sdr', 'chat', 'Chat', true),
  ('sdr', 'crm', 'CRM', true),
  ('sdr', 'lembretes', 'Lembretes', true),
  ('sdr', 'prospeccao', 'Prospecção', false),
  ('sdr', 'broadcast', 'Broadcast', false),
  ('sdr', 'equipe', 'Equipe', false),
  ('sdr', 'funnel_stages', 'Fases do Funil', false),
  ('sdr', 'funnel_manager', 'Gerenciar Funis', false),
  ('sdr', 'ai_config', 'Agente IA', false),
  ('sdr', 'ai_logs', 'Logs IA', false),
  ('sdr', 'whatsapp_config', 'WhatsApp Config', false),
  ('sdr', 'anti_block', 'Anti-Bloqueio', false),
  ('sdr', 'admin', 'Administração', false);

-- Inserir permissões iniciais para Closer (acesso completo exceto admin)
INSERT INTO public.role_permissions (role, route_key, route_label, is_allowed) VALUES
  ('closer', 'dashboard', 'Dashboard', true),
  ('closer', 'chat', 'Chat', true),
  ('closer', 'crm', 'CRM', true),
  ('closer', 'lembretes', 'Lembretes', true),
  ('closer', 'prospeccao', 'Prospecção', true),
  ('closer', 'broadcast', 'Broadcast', true),
  ('closer', 'equipe', 'Equipe', true),
  ('closer', 'funnel_stages', 'Fases do Funil', true),
  ('closer', 'funnel_manager', 'Gerenciar Funis', true),
  ('closer', 'ai_config', 'Agente IA', true),
  ('closer', 'ai_logs', 'Logs IA', true),
  ('closer', 'whatsapp_config', 'WhatsApp Config', true),
  ('closer', 'anti_block', 'Anti-Bloqueio', true),
  ('closer', 'admin', 'Administração', false);
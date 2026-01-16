-- Adicionar campo para identificar quem enviou cada mensagem
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS sent_by_user_id uuid REFERENCES profiles(user_id);

-- Criar tabela para rastrear atividade dos usuários
CREATE TABLE IF NOT EXISTS public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL, -- 'login', 'message_sent', 'stage_change', 'lead_view', 'page_view'
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON public.user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON public.user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action ON public.user_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_by_user_id ON public.whatsapp_messages(sent_by_user_id);

-- Habilitar RLS
ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - Admins podem ver tudo
CREATE POLICY "Admins can view all activity logs"
ON public.user_activity_logs
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Usuários podem inserir seus próprios logs
CREATE POLICY "Users can insert own activity logs"
ON public.user_activity_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Usuários podem ver seus próprios logs
CREATE POLICY "Users can view own activity logs"
ON public.user_activity_logs
FOR SELECT
USING (auth.uid() = user_id);
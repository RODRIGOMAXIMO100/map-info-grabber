-- Criar tabela de histórico de movimentações do funil
CREATE TABLE public.funnel_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.crm_funnel_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.crm_funnel_stages(id) ON DELETE SET NULL,
  changed_at timestamp with time zone DEFAULT now(),
  changed_by text DEFAULT 'system'
);

-- Índices para performance
CREATE INDEX idx_stage_history_conversation ON public.funnel_stage_history(conversation_id);
CREATE INDEX idx_stage_history_changed_at ON public.funnel_stage_history(changed_at DESC);

-- Habilitar RLS
ALTER TABLE public.funnel_stage_history ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública (sem auth neste projeto)
CREATE POLICY "Allow all access to funnel_stage_history"
ON public.funnel_stage_history
FOR ALL
USING (true)
WITH CHECK (true);

-- Função para registrar mudanças de estágio automaticamente
CREATE OR REPLACE FUNCTION public.log_funnel_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    INSERT INTO public.funnel_stage_history (conversation_id, from_stage_id, to_stage_id, changed_at)
    VALUES (NEW.id, OLD.funnel_stage::uuid, NEW.funnel_stage::uuid, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger para registrar automaticamente
CREATE TRIGGER trigger_log_funnel_stage_change
AFTER UPDATE ON public.whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION public.log_funnel_stage_change();

-- Habilitar realtime para atualizações ao vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.funnel_stage_history;
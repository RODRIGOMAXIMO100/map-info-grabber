-- Tabela de templates de follow-up para broadcasts
CREATE TABLE public.broadcast_followup_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  followup_number INTEGER NOT NULL,
  hours_after_broadcast INTEGER NOT NULL,
  message_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS para broadcast_followup_templates (público para leitura, restrito para escrita)
ALTER TABLE public.broadcast_followup_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to followup templates"
ON public.broadcast_followup_templates FOR SELECT
USING (true);

CREATE POLICY "Allow public insert to followup templates"
ON public.broadcast_followup_templates FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update to followup templates"
ON public.broadcast_followup_templates FOR UPDATE
USING (true);

-- Adicionar colunas na whatsapp_conversations para rastrear origem do broadcast
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS broadcast_list_id UUID REFERENCES public.broadcast_lists(id),
ADD COLUMN IF NOT EXISTS broadcast_sent_at TIMESTAMP WITH TIME ZONE;

-- Inserir templates iniciais
INSERT INTO public.broadcast_followup_templates (followup_number, hours_after_broadcast, message_template)
VALUES 
(2, 48, 'Prometo que é rápido 😅

É mais pra entender se hoje vocês:

1️⃣ dependem de indicação
2️⃣ já fazem anúncios
3️⃣ ou estão organizando o crescimento agora

Qual faz mais sentido pra realidade de vocês hoje?'),
(3, 72, 'Última mensagem, prometo 😊

Se não fizer sentido agora, tudo bem.

Se em algum momento quiser olhar oportunidades de crescimento aí na {nome_empresa}, fico à disposição.');
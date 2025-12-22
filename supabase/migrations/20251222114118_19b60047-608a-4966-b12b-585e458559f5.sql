-- Criar tabela de DNAs
CREATE TABLE public.ai_dnas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  persona_name TEXT,
  target_audience TEXT,
  offer_description TEXT,
  system_prompt TEXT NOT NULL,
  video_url TEXT,
  site_url TEXT,
  payment_link TEXT,
  tone TEXT DEFAULT 'profissional',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_dnas ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow all access to ai_dnas" 
ON public.ai_dnas 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Adicionar dna_id em broadcast_lists
ALTER TABLE public.broadcast_lists 
ADD COLUMN dna_id UUID REFERENCES public.ai_dnas(id);

-- Adicionar dna_id em whatsapp_conversations
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN dna_id UUID REFERENCES public.ai_dnas(id);

-- Enable realtime para ai_dnas
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_dnas;
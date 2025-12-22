-- ==========================================
-- SISTEMA ANTI-BLOQUEIO PARA WHATSAPP
-- ==========================================

-- Tabela para controlar limites diários por instância
CREATE TABLE public.whatsapp_instance_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.whatsapp_config(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_until TIMESTAMP WITH TIME ZONE,
  pause_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(config_id, date)
);

-- Índices para performance
CREATE INDEX idx_instance_limits_config_date ON public.whatsapp_instance_limits(config_id, date);
CREATE INDEX idx_instance_limits_paused ON public.whatsapp_instance_limits(is_paused);

-- Tabela de blacklist para números que pediram para sair
CREATE TABLE public.whatsapp_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  reason TEXT DEFAULT 'opt_out',
  keyword_matched TEXT,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  added_by TEXT DEFAULT 'system'
);

-- Índice para busca rápida de telefone
CREATE INDEX idx_blacklist_phone ON public.whatsapp_blacklist(phone);

-- Tabela de configurações anti-bloqueio
CREATE TABLE public.whatsapp_protection_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Limites
  daily_limit_warmup INTEGER NOT NULL DEFAULT 30,
  daily_limit_normal INTEGER NOT NULL DEFAULT 200,
  warmup_days INTEGER NOT NULL DEFAULT 7,
  batch_size INTEGER NOT NULL DEFAULT 40,
  pause_after_batch_minutes INTEGER NOT NULL DEFAULT 45,
  -- Delays
  min_delay_seconds INTEGER NOT NULL DEFAULT 15,
  max_delay_seconds INTEGER NOT NULL DEFAULT 45,
  -- Horário comercial
  business_hours_enabled BOOLEAN NOT NULL DEFAULT true,
  business_hours_start TIME NOT NULL DEFAULT '08:00:00',
  business_hours_end TIME NOT NULL DEFAULT '20:00:00',
  -- Proteções
  auto_blacklist_enabled BOOLEAN NOT NULL DEFAULT true,
  block_detection_enabled BOOLEAN NOT NULL DEFAULT true,
  max_consecutive_errors INTEGER NOT NULL DEFAULT 5,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Inserir configuração padrão
INSERT INTO public.whatsapp_protection_settings (id) VALUES (gen_random_uuid());

-- Habilitar RLS
ALTER TABLE public.whatsapp_instance_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_protection_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (acesso total como outras tabelas do sistema)
CREATE POLICY "Allow all access to whatsapp_instance_limits" 
ON public.whatsapp_instance_limits 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all access to whatsapp_blacklist" 
ON public.whatsapp_blacklist 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all access to whatsapp_protection_settings" 
ON public.whatsapp_protection_settings 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Adicionar campo de warm-up na tabela de config
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS warmup_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();
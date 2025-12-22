-- Adicionar config_id na tabela whatsapp_logs para rastrear qual instância enviou
ALTER TABLE public.whatsapp_logs ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.whatsapp_config(id);

-- Criar índice para otimizar queries de monitoramento
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_config_id ON public.whatsapp_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_sent_at ON public.whatsapp_logs(sent_at);

-- Habilitar realtime para logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_logs;
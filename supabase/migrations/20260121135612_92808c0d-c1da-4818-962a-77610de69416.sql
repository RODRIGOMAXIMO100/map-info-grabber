-- Tabela para histórico de status das instâncias
CREATE TABLE public.whatsapp_instance_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES whatsapp_config(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('connected', 'disconnected', 'error')),
  details jsonb DEFAULT '{}'::jsonb,
  checked_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_instance_status_config ON whatsapp_instance_status(config_id);
CREATE INDEX idx_instance_status_time ON whatsapp_instance_status(checked_at DESC);

-- RLS
ALTER TABLE whatsapp_instance_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to whatsapp_instance_status"
ON whatsapp_instance_status FOR ALL
USING (true)
WITH CHECK (true);

-- Limpar registros antigos (manter só últimas 24h)
CREATE OR REPLACE FUNCTION clean_old_instance_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM whatsapp_instance_status WHERE checked_at < now() - interval '24 hours';
END;
$$;
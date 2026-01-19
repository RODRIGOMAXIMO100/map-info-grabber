-- Add broadcast_enabled column to whatsapp_config
ALTER TABLE whatsapp_config 
ADD COLUMN IF NOT EXISTS broadcast_enabled boolean DEFAULT true;

COMMENT ON COLUMN whatsapp_config.broadcast_enabled IS 
'Se true, esta instância participa do rodízio de disparo de broadcasts';
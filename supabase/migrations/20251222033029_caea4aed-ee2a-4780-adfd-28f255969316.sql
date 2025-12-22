-- Add config_id column to whatsapp_queue for tracking which instance sent each message
ALTER TABLE public.whatsapp_queue 
ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.whatsapp_config(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_config_id ON public.whatsapp_queue(config_id);
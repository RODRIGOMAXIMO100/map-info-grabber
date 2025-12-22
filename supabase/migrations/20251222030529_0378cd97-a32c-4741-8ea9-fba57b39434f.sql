-- Add columns to whatsapp_config for multi-instance support
ALTER TABLE public.whatsapp_config 
ADD COLUMN IF NOT EXISTS name text DEFAULT 'Principal',
ADD COLUMN IF NOT EXISTS color text DEFAULT '#10B981';

-- Add config_id to whatsapp_conversations to link to specific instance
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.whatsapp_config(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_config_id ON public.whatsapp_conversations(config_id);
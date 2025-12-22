-- Add lead_data column to whatsapp_queue for storing lead info per message
ALTER TABLE public.whatsapp_queue 
ADD COLUMN IF NOT EXISTS lead_data jsonb DEFAULT NULL;
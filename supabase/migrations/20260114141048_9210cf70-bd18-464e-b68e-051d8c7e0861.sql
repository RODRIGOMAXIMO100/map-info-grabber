-- Remove the old unique constraint on phone only
ALTER TABLE public.whatsapp_conversations 
DROP CONSTRAINT IF EXISTS whatsapp_conversations_phone_key;

-- Create new constraint that allows same phone on different instances
ALTER TABLE public.whatsapp_conversations 
ADD CONSTRAINT whatsapp_conversations_phone_config_key 
UNIQUE (phone, config_id);
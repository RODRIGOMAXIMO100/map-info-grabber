-- Add phone_invalid column to track numbers that are not on WhatsApp
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS phone_invalid boolean DEFAULT false;

-- Index for efficient queries on invalid phones
CREATE INDEX IF NOT EXISTS idx_conversations_phone_invalid 
ON whatsapp_conversations(phone_invalid) 
WHERE phone_invalid = true;
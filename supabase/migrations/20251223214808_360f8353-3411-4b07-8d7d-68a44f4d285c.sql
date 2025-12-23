-- Add conversation summary columns to whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS conversation_summary TEXT,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP WITH TIME ZONE;
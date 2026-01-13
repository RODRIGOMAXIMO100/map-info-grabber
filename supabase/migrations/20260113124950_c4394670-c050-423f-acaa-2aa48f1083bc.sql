-- Add warning_message column to whatsapp_queue for cross-instance alerts
ALTER TABLE whatsapp_queue ADD COLUMN IF NOT EXISTS warning_message TEXT;

-- Add contacted_by_instances array to track which instances contacted each phone
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS contacted_by_instances TEXT[] DEFAULT '{}';
-- Fix legacy funnel_stage values that are 'new' instead of UUID
UPDATE whatsapp_conversations 
SET funnel_stage = 'bffd9d20-9f4a-49fa-93fc-61aebca00759'
WHERE funnel_stage = 'new'
  AND is_crm_lead = true;
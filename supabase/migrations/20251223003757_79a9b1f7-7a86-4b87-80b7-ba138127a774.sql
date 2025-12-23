-- Add origin column to track if lead came from broadcast or random
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'random';

-- Add funnel_stage column for manual stage control
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN IF NOT EXISTS funnel_stage TEXT DEFAULT 'new';

-- Add constraint for origin values
ALTER TABLE public.whatsapp_conversations 
ADD CONSTRAINT check_origin CHECK (origin IN ('broadcast', 'random'));
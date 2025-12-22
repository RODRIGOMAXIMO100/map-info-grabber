-- Add new CRM fields for Pipedrive-style functionality

-- Add reminder_at for scheduling follow-up reminders
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ DEFAULT NULL;

-- Add estimated_value for deal value tracking
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS estimated_value NUMERIC DEFAULT NULL;

-- Add custom_tags for additional labels beyond funnel stages
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS custom_tags TEXT[] DEFAULT '{}'::text[];

-- Add notes field for seller annotations
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- Add next_action field for tracking what action is needed
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS next_action TEXT DEFAULT NULL;

-- Add converted_at to track conversions
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ DEFAULT NULL;
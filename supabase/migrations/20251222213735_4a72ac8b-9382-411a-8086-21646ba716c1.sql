-- Add validation columns to broadcast_lists
ALTER TABLE public.broadcast_lists 
ADD COLUMN IF NOT EXISTS validated_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS valid_count integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS invalid_count integer DEFAULT NULL;
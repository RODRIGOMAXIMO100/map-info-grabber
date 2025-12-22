-- Add whatsapp_queue to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_queue;

-- Enable full replica identity for complete row data on updates
ALTER TABLE public.whatsapp_queue REPLICA IDENTITY FULL;

-- Add broadcast_lists to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_lists;

-- Enable full replica identity for broadcast_lists
ALTER TABLE public.broadcast_lists REPLICA IDENTITY FULL;
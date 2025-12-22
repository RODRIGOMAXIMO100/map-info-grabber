-- Add updated_at column to whatsapp_queue table
ALTER TABLE public.whatsapp_queue 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to auto-update the updated_at column
CREATE OR REPLACE FUNCTION public.update_whatsapp_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
DROP TRIGGER IF EXISTS update_whatsapp_queue_updated_at ON public.whatsapp_queue;
CREATE TRIGGER update_whatsapp_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_whatsapp_queue_updated_at();
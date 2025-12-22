-- Create function to atomically get and lock pending broadcast messages
-- Uses FOR UPDATE SKIP LOCKED to prevent race conditions
CREATE OR REPLACE FUNCTION get_pending_broadcast_messages(batch_limit INTEGER)
RETURNS SETOF whatsapp_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_queue
  SET status = 'processing', 
      updated_at = now()
  WHERE id IN (
    SELECT id FROM whatsapp_queue
    WHERE status = 'pending'
    AND (attempts IS NULL OR attempts < 3)
    ORDER BY created_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
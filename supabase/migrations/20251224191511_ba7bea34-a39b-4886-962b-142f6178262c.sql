-- Corrigir função para usar EXISTS ao invés de LEFT JOIN (evita erro FOR UPDATE)
CREATE OR REPLACE FUNCTION public.get_pending_broadcast_messages(batch_limit integer)
 RETURNS SETOF whatsapp_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_queue
  SET status = 'processing', 
      updated_at = now()
  WHERE id IN (
    SELECT wq.id FROM whatsapp_queue wq
    WHERE wq.status = 'pending'
    AND (wq.attempts IS NULL OR wq.attempts < 3)
    -- Só processar: mensagens sem broadcast OU broadcasts com status 'sending'
    AND (
      wq.broadcast_list_id IS NULL 
      OR EXISTS (
        SELECT 1 FROM broadcast_lists bl 
        WHERE bl.id = wq.broadcast_list_id 
        AND bl.status = 'sending'
      )
    )
    ORDER BY wq.created_at ASC
    LIMIT batch_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$function$
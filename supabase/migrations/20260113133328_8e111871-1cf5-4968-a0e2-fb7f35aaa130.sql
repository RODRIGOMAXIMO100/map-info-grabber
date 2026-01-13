-- Função para preencher retroativamente lead_city, lead_state e broadcast_list_id
CREATE OR REPLACE FUNCTION backfill_lead_origin_data()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
BEGIN
  UPDATE whatsapp_conversations c
  SET 
    lead_city = COALESCE(c.lead_city, (q.lead_data->>'city')::text),
    lead_state = COALESCE(c.lead_state, (q.lead_data->>'state')::text),
    broadcast_list_id = COALESCE(c.broadcast_list_id, q.broadcast_list_id),
    updated_at = NOW()
  FROM whatsapp_queue q
  WHERE 
    RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 8) = 
    RIGHT(REGEXP_REPLACE(q.phone, '[^0-9]', '', 'g'), 8)
    AND q.lead_data IS NOT NULL
    AND c.is_crm_lead = true
    AND (c.lead_city IS NULL OR c.broadcast_list_id IS NULL);
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Executar a migração retroativa
SELECT backfill_lead_origin_data();

-- Remover a função após uso (cleanup)
DROP FUNCTION IF EXISTS backfill_lead_origin_data();
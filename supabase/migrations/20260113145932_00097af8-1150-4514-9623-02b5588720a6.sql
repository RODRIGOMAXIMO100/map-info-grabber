-- Migrate legacy data: populate broadcast_sent_at for conversations that have broadcast_list_id
UPDATE whatsapp_conversations wc
SET broadcast_sent_at = COALESCE(
  (SELECT created_at FROM broadcast_lists bl WHERE bl.id = wc.broadcast_list_id),
  wc.created_at
)
WHERE wc.broadcast_list_id IS NOT NULL
  AND wc.broadcast_sent_at IS NULL;
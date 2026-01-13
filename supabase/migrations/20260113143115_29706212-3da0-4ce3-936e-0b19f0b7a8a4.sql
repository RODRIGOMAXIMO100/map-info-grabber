-- Adicionar coluna para rastrear quando o lead mudou de estágio
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS funnel_stage_changed_at timestamp with time zone DEFAULT now();

-- Criar função para atualizar timestamp automaticamente
CREATE OR REPLACE FUNCTION update_funnel_stage_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    NEW.funnel_stage_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger
DROP TRIGGER IF EXISTS trigger_funnel_stage_changed ON whatsapp_conversations;
CREATE TRIGGER trigger_funnel_stage_changed
BEFORE UPDATE ON whatsapp_conversations
FOR EACH ROW EXECUTE FUNCTION update_funnel_stage_timestamp();

-- Migrar dados legados: associar conversas órfãs ao funil padrão
UPDATE whatsapp_conversations 
SET crm_funnel_id = '48d3d4d9-940d-40b9-8c8b-74686c5026f9'
WHERE is_crm_lead = true 
  AND crm_funnel_id IS NULL;

-- Mapear valores antigos de texto para UUIDs
UPDATE whatsapp_conversations 
SET funnel_stage = 'bffd9d20-9f4a-49fa-93fc-61aebca00759'
WHERE funnel_stage = 'new';

UPDATE whatsapp_conversations 
SET funnel_stage = '366e8602-75c8-4416-a4cd-5b223ad8f889'
WHERE funnel_stage = 'interest';

-- Inicializar funnel_stage_changed_at com last_message_at para dados existentes
UPDATE whatsapp_conversations 
SET funnel_stage_changed_at = COALESCE(last_message_at, created_at)
WHERE funnel_stage_changed_at IS NULL OR funnel_stage_changed_at = created_at;
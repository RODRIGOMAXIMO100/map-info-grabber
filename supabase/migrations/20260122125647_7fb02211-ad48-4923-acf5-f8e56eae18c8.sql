-- Atualizar a função para ignorar IDs inválidos ao inserir no histórico
CREATE OR REPLACE FUNCTION public.log_funnel_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  from_stage_uuid uuid;
  to_stage_uuid uuid;
  from_stage_exists boolean := false;
  to_stage_exists boolean := false;
BEGIN
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    -- Tenta converter para UUID, ignora se falhar
    BEGIN
      from_stage_uuid := OLD.funnel_stage::uuid;
      -- Verificar se o from_stage existe na tabela crm_funnel_stages
      SELECT EXISTS(SELECT 1 FROM crm_funnel_stages WHERE id = from_stage_uuid) INTO from_stage_exists;
    EXCEPTION WHEN others THEN
      from_stage_uuid := NULL;
    END;
    
    BEGIN
      to_stage_uuid := NEW.funnel_stage::uuid;
      -- Verificar se o to_stage existe na tabela crm_funnel_stages
      SELECT EXISTS(SELECT 1 FROM crm_funnel_stages WHERE id = to_stage_uuid) INTO to_stage_exists;
    EXCEPTION WHEN others THEN
      to_stage_uuid := NULL;
    END;
    
    -- Só insere no histórico se o to_stage é um UUID válido E existe na tabela
    -- Se from_stage não existe, usa NULL
    IF to_stage_uuid IS NOT NULL AND to_stage_exists THEN
      INSERT INTO public.funnel_stage_history (conversation_id, from_stage_id, to_stage_id, changed_at)
      VALUES (NEW.id, 
              CASE WHEN from_stage_exists THEN from_stage_uuid ELSE NULL END, 
              to_stage_uuid, 
              now());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
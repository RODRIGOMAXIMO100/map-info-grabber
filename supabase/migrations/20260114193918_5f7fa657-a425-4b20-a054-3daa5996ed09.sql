-- Temporariamente modificar o trigger para aceitar valores não-UUID
CREATE OR REPLACE FUNCTION public.log_funnel_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  from_stage_uuid uuid;
  to_stage_uuid uuid;
BEGIN
  IF NEW.funnel_stage IS DISTINCT FROM OLD.funnel_stage THEN
    -- Tenta converter para UUID, ignora se falhar
    BEGIN
      from_stage_uuid := OLD.funnel_stage::uuid;
    EXCEPTION WHEN others THEN
      from_stage_uuid := NULL;
    END;
    
    BEGIN
      to_stage_uuid := NEW.funnel_stage::uuid;
    EXCEPTION WHEN others THEN
      to_stage_uuid := NULL;
    END;
    
    -- Só insere no histórico se ambos são UUIDs válidos
    IF to_stage_uuid IS NOT NULL THEN
      INSERT INTO public.funnel_stage_history (conversation_id, from_stage_id, to_stage_id, changed_at)
      VALUES (NEW.id, from_stage_uuid, to_stage_uuid, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
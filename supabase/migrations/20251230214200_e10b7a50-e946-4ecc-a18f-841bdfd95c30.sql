-- Adicionar campos de roteiro SDR na tabela whatsapp_ai_config
ALTER TABLE public.whatsapp_ai_config 
ADD COLUMN IF NOT EXISTS elevator_pitch text,
ADD COLUMN IF NOT EXISTS value_proposition text,
ADD COLUMN IF NOT EXISTS differentiator text,
ADD COLUMN IF NOT EXISTS typical_results text,
ADD COLUMN IF NOT EXISTS qualification_questions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS max_chars_per_stage jsonb DEFAULT '{"STAGE_1": 250, "STAGE_2": 200, "STAGE_3": 400, "STAGE_4": 350, "STAGE_5": 200}'::jsonb;

-- Adicionar campo example_response na tabela ai_stage_prompts
ALTER TABLE public.ai_stage_prompts
ADD COLUMN IF NOT EXISTS example_response text,
ADD COLUMN IF NOT EXISTS required_deliverables text[] DEFAULT '{}'::text[];

-- Adicionar campo value_delivery_status na tabela whatsapp_conversations para rastrear entrega de valor
ALTER TABLE public.whatsapp_conversations
ADD COLUMN IF NOT EXISTS value_delivery_status jsonb DEFAULT '{"elevator_pitch_delivered": false, "qualification_done": false, "pain_identified": null, "value_proposition_delivered": false, "differentiator_mentioned": false, "results_mentioned": false, "cta_proposed": false}'::jsonb;
-- Set warmup_started_at to 30 days ago for existing instances that have NULL
-- This marks them as already warmed up (past the warmup period)
UPDATE public.whatsapp_config
SET warmup_started_at = NOW() - INTERVAL '30 days'
WHERE warmup_started_at IS NULL;
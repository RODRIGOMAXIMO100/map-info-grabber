-- Add CRM funnel targeting columns to broadcast_lists
ALTER TABLE broadcast_lists 
ADD COLUMN IF NOT EXISTS crm_funnel_id UUID REFERENCES crm_funnels(id),
ADD COLUMN IF NOT EXISTS crm_funnel_stage_id UUID REFERENCES crm_funnel_stages(id);

-- Add comment for documentation
COMMENT ON COLUMN broadcast_lists.crm_funnel_id IS 'Target CRM funnel for leads from this broadcast';
COMMENT ON COLUMN broadcast_lists.crm_funnel_stage_id IS 'Initial stage in the funnel for leads from this broadcast';
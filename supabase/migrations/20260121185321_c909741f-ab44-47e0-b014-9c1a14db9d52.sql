-- Add utm_data column to whatsapp_conversations
ALTER TABLE whatsapp_conversations 
ADD COLUMN IF NOT EXISTS utm_data jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN whatsapp_conversations.utm_data IS 'UTM parameters from lead source (utm_source, utm_medium, utm_campaign, utm_term, utm_content)';

-- Create table for managing API keys for external integrations
CREATE TABLE IF NOT EXISTS integration_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_key text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE integration_api_keys ENABLE ROW LEVEL SECURITY;

-- Only admins can manage API keys
CREATE POLICY "Admins can manage API keys" ON integration_api_keys
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster API key lookups
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_api_key ON integration_api_keys(api_key) WHERE is_active = true;
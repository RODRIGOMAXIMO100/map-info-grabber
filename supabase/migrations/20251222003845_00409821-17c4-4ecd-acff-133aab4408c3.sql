-- 1. Tabela de configuração WhatsApp (UAZAPI)
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url TEXT NOT NULL,
  instance_token TEXT NOT NULL,
  admin_token TEXT,
  instance_phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de conversas WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  group_name TEXT,
  is_group BOOLEAN DEFAULT false,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_preview TEXT,
  unread_count INTEGER DEFAULT 0,
  pinned BOOLEAN DEFAULT false,
  muted_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  ai_paused BOOLEAN DEFAULT false,
  ai_pending_at TIMESTAMPTZ,
  ai_handoff_reason TEXT,
  video_sent BOOLEAN DEFAULT false,
  site_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de mensagens WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  media_url TEXT,
  message_id_whatsapp TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de labels/etiquetas do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela de configuração do Agente IA
CREATE TABLE IF NOT EXISTS whatsapp_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN DEFAULT false,
  system_prompt TEXT NOT NULL,
  video_url TEXT,
  payment_link TEXT,
  site_url TEXT,
  working_hours_start TIME DEFAULT '08:00:00',
  working_hours_end TIME DEFAULT '22:00:00',
  auto_reply_delay_seconds INTEGER DEFAULT 5,
  classification_rules JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela de logs da IA
CREATE TABLE IF NOT EXISTS whatsapp_ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES whatsapp_conversations(id),
  incoming_message TEXT,
  ai_response TEXT,
  detected_intent TEXT,
  applied_label_id TEXT,
  confidence_score NUMERIC,
  needs_human BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Tabela de agendamentos de disparos
CREATE TABLE IF NOT EXISTS whatsapp_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
  send_time TIME NOT NULL,
  manual_phones TEXT[] DEFAULT '{}',
  image_url TEXT,
  apply_label_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Tabela de fila de mensagens
CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES whatsapp_schedules(id),
  broadcast_list_id UUID,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- 9. Tabela de logs de envio
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES whatsapp_schedules(id),
  subscription_id UUID,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- 10. Tabela de listas de disparo (NOVA - para integrar com busca de leads)
CREATE TABLE IF NOT EXISTS broadcast_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  phones TEXT[] DEFAULT '{}',
  lead_data JSONB DEFAULT '[]',
  message_template TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar realtime para mensagens e conversas
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON whatsapp_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_whatsapp_id ON whatsapp_messages(message_id_whatsapp);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON whatsapp_conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_ai_pending ON whatsapp_conversations(ai_pending_at);
CREATE INDEX IF NOT EXISTS idx_queue_status ON whatsapp_queue(status);
CREATE INDEX IF NOT EXISTS idx_broadcast_lists_status ON broadcast_lists(status);

-- Inserir labels padrão do CRM
INSERT INTO whatsapp_labels (label_id, name, color) VALUES
  ('16', 'Lead Frio', 1),
  ('13', 'Demonstrou Interesse', 2),
  ('14', 'Quer Comprar', 3)
ON CONFLICT (label_id) DO NOTHING;

-- Inserir configuração padrão da IA
INSERT INTO whatsapp_ai_config (system_prompt, is_active) VALUES
  ('Você é um assistente de vendas amigável e profissional. Seu objetivo é qualificar leads e guiá-los pelo funil de vendas. Seja conciso e direto nas respostas.', false)
ON CONFLICT DO NOTHING;
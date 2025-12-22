-- Habilitar RLS em todas as tabelas
ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_ai_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_lists ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para acesso público (sistema interno sem auth por enquanto)
-- whatsapp_config
CREATE POLICY "Allow all access to whatsapp_config" ON whatsapp_config FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_conversations
CREATE POLICY "Allow all access to whatsapp_conversations" ON whatsapp_conversations FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_messages
CREATE POLICY "Allow all access to whatsapp_messages" ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_labels
CREATE POLICY "Allow all access to whatsapp_labels" ON whatsapp_labels FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_ai_config
CREATE POLICY "Allow all access to whatsapp_ai_config" ON whatsapp_ai_config FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_ai_logs
CREATE POLICY "Allow all access to whatsapp_ai_logs" ON whatsapp_ai_logs FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_schedules
CREATE POLICY "Allow all access to whatsapp_schedules" ON whatsapp_schedules FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_queue
CREATE POLICY "Allow all access to whatsapp_queue" ON whatsapp_queue FOR ALL USING (true) WITH CHECK (true);

-- whatsapp_logs
CREATE POLICY "Allow all access to whatsapp_logs" ON whatsapp_logs FOR ALL USING (true) WITH CHECK (true);

-- broadcast_lists
CREATE POLICY "Allow all access to broadcast_lists" ON broadcast_lists FOR ALL USING (true) WITH CHECK (true);
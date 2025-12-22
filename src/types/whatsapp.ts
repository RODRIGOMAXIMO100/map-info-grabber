export interface WhatsAppConfig {
  id: string;
  server_url: string;
  instance_token: string;
  admin_token?: string;
  instance_phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConversation {
  id: string;
  phone: string;
  name?: string;
  group_name?: string;
  is_group: boolean;
  avatar_url?: string;
  tags: string[];
  last_message_at: string;
  last_message_preview?: string;
  unread_count: number;
  pinned: boolean;
  muted_until?: string;
  status: string;
  ai_paused: boolean;
  ai_pending_at?: string;
  ai_handoff_reason?: string;
  video_sent: boolean;
  site_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  direction: 'incoming' | 'outgoing';
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'ptt' | 'sticker';
  content?: string;
  media_url?: string;
  message_id_whatsapp?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  edited_at?: string;
  created_at: string;
}

export interface WhatsAppLabel {
  id: string;
  label_id: string;
  name: string;
  color: number;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppAIConfig {
  id: string;
  is_active: boolean;
  system_prompt: string;
  video_url?: string;
  payment_link?: string;
  site_url?: string;
  working_hours_start: string;
  working_hours_end: string;
  auto_reply_delay_seconds: number;
  classification_rules: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSchedule {
  id: string;
  name: string;
  message_template: string;
  days_of_week: number[];
  send_time: string;
  manual_phones: string[];
  image_url?: string;
  apply_label_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppQueue {
  id: string;
  schedule_id?: string;
  broadcast_list_id?: string;
  phone: string;
  message: string;
  image_url?: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attempts: number;
  error_message?: string;
  created_at: string;
  processed_at?: string;
}

export interface BroadcastList {
  id: string;
  name: string;
  description?: string;
  phones: string[];
  lead_data: LeadData[];
  message_template?: string;
  image_url?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused';
  scheduled_at?: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

export interface LeadData {
  name: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  rating?: number;
  whatsapp?: string;
  instagram?: string;
  website?: string;
}

export interface CRMStage {
  id: string;
  label_id: string;
  name: string;
  color: number;
  order: number;
}

export const CRM_STAGES: CRMStage[] = [
  { id: '1', label_id: '16', name: 'Lead Frio', color: 1, order: 1 },
  { id: '2', label_id: '13', name: 'Demonstrou Interesse', color: 2, order: 2 },
  { id: '3', label_id: '14', name: 'Quer Comprar', color: 3, order: 3 },
];

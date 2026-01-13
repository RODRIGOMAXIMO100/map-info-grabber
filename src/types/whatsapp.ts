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
  last_lead_message_at?: string;
  last_followup_at?: string;
  followup_count?: number;
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
  // CRM fields
  is_crm_lead?: boolean;
  crm_funnel_id?: string | null;
  dna_id?: string;
  reminder_at?: string;
  estimated_value?: number;
  custom_tags?: string[];
  notes?: string;
  next_action?: string;
  converted_at?: string;
  funnel_stage?: string;
  origin?: string;
  conversation_summary?: string;
  summary_updated_at?: string;
  contacted_by_instances?: string[];
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
  [key: string]: string | number | undefined;
}

export interface CRMStage {
  id: string;
  label_id: string;
  name: string;
  color: number;
  order: number;
  is_ai_controlled: boolean;
}

// SDR Funnel - 5 estágios de IA + 3 manuais (vendedor)
// IA: Lead Novo → Levantamento → Apresentação → Interesse Confirmado → Handoff
// Manual: Negociando → Convertido/Perdido
export const CRM_STAGES: CRMStage[] = [
  // ===== ESTÁGIOS DA IA (SDR automático) =====
  { id: 'new', label_id: 'new', name: 'Lead Novo', color: 1, order: 1, is_ai_controlled: true },
  { id: 'qualification', label_id: 'qualification', name: 'Levantamento', color: 2, order: 2, is_ai_controlled: true },
  { id: 'presentation', label_id: 'presentation', name: 'Apresentação', color: 3, order: 3, is_ai_controlled: true },
  { id: 'interest', label_id: 'interest', name: 'Interesse Confirmado', color: 4, order: 4, is_ai_controlled: true },
  { id: 'handoff', label_id: 'handoff', name: 'Handoff', color: 5, order: 5, is_ai_controlled: true },
  // ===== ESTÁGIOS MANUAIS (Vendedor) =====
  { id: 'negotiating', label_id: 'negotiating', name: 'Negociando', color: 6, order: 6, is_ai_controlled: false },
  { id: 'converted', label_id: 'converted', name: 'Convertido', color: 7, order: 7, is_ai_controlled: false },
  { id: 'lost', label_id: 'lost', name: 'Perdido', color: 8, order: 8, is_ai_controlled: false },
];

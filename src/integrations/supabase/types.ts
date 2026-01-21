export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_stage_prompts: {
        Row: {
          created_at: string | null
          example_response: string | null
          failure_criteria: string | null
          id: string
          is_active: boolean | null
          max_messages_in_stage: number | null
          objective: string
          required_deliverables: string[] | null
          stage_id: string
          stage_name: string
          success_criteria: string | null
          system_prompt: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          example_response?: string | null
          failure_criteria?: string | null
          id?: string
          is_active?: boolean | null
          max_messages_in_stage?: number | null
          objective: string
          required_deliverables?: string[] | null
          stage_id: string
          stage_name: string
          success_criteria?: string | null
          system_prompt: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          example_response?: string | null
          failure_criteria?: string | null
          id?: string
          is_active?: boolean | null
          max_messages_in_stage?: number | null
          objective?: string
          required_deliverables?: string[] | null
          stage_id?: string
          stage_name?: string
          success_criteria?: string | null
          system_prompt?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      broadcast_followup_templates: {
        Row: {
          created_at: string
          followup_number: number
          hours_after_broadcast: number
          id: string
          is_active: boolean
          message_template: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          followup_number: number
          hours_after_broadcast: number
          id?: string
          is_active?: boolean
          message_template: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          followup_number?: number
          hours_after_broadcast?: number
          id?: string
          is_active?: boolean
          message_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_lists: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          description: string | null
          failed_count: number | null
          id: string
          image_url: string | null
          invalid_count: number | null
          lead_data: Json | null
          message_template: string | null
          name: string
          phones: string[] | null
          scheduled_at: string | null
          sent_count: number | null
          status: string
          updated_at: string | null
          valid_count: number | null
          validated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          failed_count?: number | null
          id?: string
          image_url?: string | null
          invalid_count?: number | null
          lead_data?: Json | null
          message_template?: string | null
          name: string
          phones?: string[] | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string
          updated_at?: string | null
          valid_count?: number | null
          validated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          description?: string | null
          failed_count?: number | null
          id?: string
          image_url?: string | null
          invalid_count?: number | null
          lead_data?: Json | null
          message_template?: string | null
          name?: string
          phones?: string[] | null
          scheduled_at?: string | null
          sent_count?: number | null
          status?: string
          updated_at?: string | null
          valid_count?: number | null
          validated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_lists_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      crm_funnel_stages: {
        Row: {
          color: string | null
          created_at: string | null
          funnel_id: string
          id: string
          is_ai_controlled: boolean | null
          name: string
          stage_order: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          funnel_id: string
          id?: string
          is_ai_controlled?: boolean | null
          name: string
          stage_order?: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          funnel_id?: string
          id?: string
          is_ai_controlled?: boolean | null
          name?: string
          stage_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_funnel_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "crm_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_funnel_users: {
        Row: {
          created_at: string | null
          funnel_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          funnel_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          funnel_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_funnel_users_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "crm_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_funnels: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      funnel_stage_history: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          conversation_id: string | null
          from_stage_id: string | null
          id: string
          to_stage_id: string | null
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          conversation_id?: string | null
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string | null
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          conversation_id?: string | null
          from_stage_id?: string | null
          id?: string
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stage_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "crm_funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          name: string
          usage_count: number | null
        }
        Insert: {
          api_key: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name: string
          usage_count?: number | null
        }
        Update: {
          api_key?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          name?: string
          usage_count?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          id?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          id: string
          is_allowed: boolean
          role: Database["public"]["Enums"]["app_role"]
          route_key: string
          route_label: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_allowed?: boolean
          role: Database["public"]["Enums"]["app_role"]
          route_key: string
          route_label: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_allowed?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          route_key?: string
          route_label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          cache_key: string
          city: string
          created_at: string
          expires_at: string
          id: string
          keyword: string
          result_count: number
          results: Json
          search_type: string
          state: string
        }
        Insert: {
          cache_key: string
          city: string
          created_at?: string
          expires_at?: string
          id?: string
          keyword: string
          result_count?: number
          results?: Json
          search_type: string
          state: string
        }
        Update: {
          cache_key?: string
          city?: string
          created_at?: string
          expires_at?: string
          id?: string
          keyword?: string
          result_count?: number
          results?: Json
          search_type?: string
          state?: string
        }
        Relationships: []
      }
      user_activity_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_ai_config: {
        Row: {
          auto_reply_delay_seconds: number | null
          classification_rules: Json | null
          created_at: string | null
          differentiator: string | null
          elevator_pitch: string | null
          id: string
          is_active: boolean | null
          max_chars_per_stage: Json | null
          offer_description: string | null
          payment_link: string | null
          persona_name: string | null
          qualification_questions: Json | null
          site_url: string | null
          system_prompt: string
          target_audience: string | null
          tone: string | null
          typical_results: string | null
          updated_at: string | null
          value_proposition: string | null
          video_url: string | null
          working_hours_end: string | null
          working_hours_start: string | null
        }
        Insert: {
          auto_reply_delay_seconds?: number | null
          classification_rules?: Json | null
          created_at?: string | null
          differentiator?: string | null
          elevator_pitch?: string | null
          id?: string
          is_active?: boolean | null
          max_chars_per_stage?: Json | null
          offer_description?: string | null
          payment_link?: string | null
          persona_name?: string | null
          qualification_questions?: Json | null
          site_url?: string | null
          system_prompt: string
          target_audience?: string | null
          tone?: string | null
          typical_results?: string | null
          updated_at?: string | null
          value_proposition?: string | null
          video_url?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Update: {
          auto_reply_delay_seconds?: number | null
          classification_rules?: Json | null
          created_at?: string | null
          differentiator?: string | null
          elevator_pitch?: string | null
          id?: string
          is_active?: boolean | null
          max_chars_per_stage?: Json | null
          offer_description?: string | null
          payment_link?: string | null
          persona_name?: string | null
          qualification_questions?: Json | null
          site_url?: string | null
          system_prompt?: string
          target_audience?: string | null
          tone?: string | null
          typical_results?: string | null
          updated_at?: string | null
          value_proposition?: string | null
          video_url?: string | null
          working_hours_end?: string | null
          working_hours_start?: string | null
        }
        Relationships: []
      }
      whatsapp_ai_logs: {
        Row: {
          ai_response: string | null
          applied_label_id: string | null
          bant_score: Json | null
          confidence_score: number | null
          conversation_id: string | null
          created_at: string | null
          detected_intent: string | null
          id: string
          incoming_message: string | null
          needs_human: boolean | null
        }
        Insert: {
          ai_response?: string | null
          applied_label_id?: string | null
          bant_score?: Json | null
          confidence_score?: number | null
          conversation_id?: string | null
          created_at?: string | null
          detected_intent?: string | null
          id?: string
          incoming_message?: string | null
          needs_human?: boolean | null
        }
        Update: {
          ai_response?: string | null
          applied_label_id?: string | null
          bant_score?: Json | null
          confidence_score?: number | null
          conversation_id?: string | null
          created_at?: string | null
          detected_intent?: string | null
          id?: string
          incoming_message?: string | null
          needs_human?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_blacklist: {
        Row: {
          added_at: string
          added_by: string | null
          id: string
          keyword_matched: string | null
          phone: string
          reason: string | null
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          id?: string
          keyword_matched?: string | null
          phone: string
          reason?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string | null
          id?: string
          keyword_matched?: string | null
          phone?: string
          reason?: string | null
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          admin_token: string | null
          broadcast_enabled: boolean | null
          color: string | null
          created_at: string | null
          id: string
          instance_phone: string | null
          instance_token: string
          is_active: boolean | null
          name: string | null
          server_url: string
          updated_at: string | null
          warmup_started_at: string | null
        }
        Insert: {
          admin_token?: string | null
          broadcast_enabled?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          instance_phone?: string | null
          instance_token: string
          is_active?: boolean | null
          name?: string | null
          server_url: string
          updated_at?: string | null
          warmup_started_at?: string | null
        }
        Update: {
          admin_token?: string | null
          broadcast_enabled?: boolean | null
          color?: string | null
          created_at?: string | null
          id?: string
          instance_phone?: string | null
          instance_token?: string
          is_active?: boolean | null
          name?: string | null
          server_url?: string
          updated_at?: string | null
          warmup_started_at?: string | null
        }
        Relationships: []
      }
      whatsapp_conversations: {
        Row: {
          ai_handoff_reason: string | null
          ai_paused: boolean | null
          ai_pending_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          avatar_url: string | null
          broadcast_list_id: string | null
          broadcast_sent_at: string | null
          closed_value: number | null
          config_id: string | null
          contacted_by_instances: string[] | null
          conversation_summary: string | null
          converted_at: string | null
          created_at: string | null
          crm_funnel_id: string | null
          custom_tags: string[] | null
          estimated_value: number | null
          followup_count: number | null
          funnel_stage: string | null
          funnel_stage_changed_at: string | null
          group_name: string | null
          id: string
          is_crm_lead: boolean | null
          is_group: boolean | null
          last_followup_at: string | null
          last_lead_message_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          lead_city: string | null
          lead_state: string | null
          messages_in_current_stage: number | null
          muted_until: string | null
          name: string | null
          next_action: string | null
          notes: string | null
          origin: string | null
          phone: string
          pinned: boolean | null
          reminder_at: string | null
          site_sent: boolean | null
          status: string
          summary_updated_at: string | null
          tags: string[] | null
          transferred_by: string | null
          unread_count: number | null
          updated_at: string | null
          utm_data: Json | null
          value_delivery_status: Json | null
          video_sent: boolean | null
        }
        Insert: {
          ai_handoff_reason?: string | null
          ai_paused?: boolean | null
          ai_pending_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          broadcast_list_id?: string | null
          broadcast_sent_at?: string | null
          closed_value?: number | null
          config_id?: string | null
          contacted_by_instances?: string[] | null
          conversation_summary?: string | null
          converted_at?: string | null
          created_at?: string | null
          crm_funnel_id?: string | null
          custom_tags?: string[] | null
          estimated_value?: number | null
          followup_count?: number | null
          funnel_stage?: string | null
          funnel_stage_changed_at?: string | null
          group_name?: string | null
          id?: string
          is_crm_lead?: boolean | null
          is_group?: boolean | null
          last_followup_at?: string | null
          last_lead_message_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_city?: string | null
          lead_state?: string | null
          messages_in_current_stage?: number | null
          muted_until?: string | null
          name?: string | null
          next_action?: string | null
          notes?: string | null
          origin?: string | null
          phone: string
          pinned?: boolean | null
          reminder_at?: string | null
          site_sent?: boolean | null
          status?: string
          summary_updated_at?: string | null
          tags?: string[] | null
          transferred_by?: string | null
          unread_count?: number | null
          updated_at?: string | null
          utm_data?: Json | null
          value_delivery_status?: Json | null
          video_sent?: boolean | null
        }
        Update: {
          ai_handoff_reason?: string | null
          ai_paused?: boolean | null
          ai_pending_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          avatar_url?: string | null
          broadcast_list_id?: string | null
          broadcast_sent_at?: string | null
          closed_value?: number | null
          config_id?: string | null
          contacted_by_instances?: string[] | null
          conversation_summary?: string | null
          converted_at?: string | null
          created_at?: string | null
          crm_funnel_id?: string | null
          custom_tags?: string[] | null
          estimated_value?: number | null
          followup_count?: number | null
          funnel_stage?: string | null
          funnel_stage_changed_at?: string | null
          group_name?: string | null
          id?: string
          is_crm_lead?: boolean | null
          is_group?: boolean | null
          last_followup_at?: string | null
          last_lead_message_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          lead_city?: string | null
          lead_state?: string | null
          messages_in_current_stage?: number | null
          muted_until?: string | null
          name?: string | null
          next_action?: string | null
          notes?: string | null
          origin?: string | null
          phone?: string
          pinned?: boolean | null
          reminder_at?: string | null
          site_sent?: boolean | null
          status?: string
          summary_updated_at?: string | null
          tags?: string[] | null
          transferred_by?: string | null
          unread_count?: number | null
          updated_at?: string | null
          utm_data?: Json | null
          value_delivery_status?: Json | null
          video_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_broadcast_list_id_fkey"
            columns: ["broadcast_list_id"]
            isOneToOne: false
            referencedRelation: "broadcast_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_crm_funnel_id_fkey"
            columns: ["crm_funnel_id"]
            isOneToOne: false
            referencedRelation: "crm_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_limits: {
        Row: {
          config_id: string
          consecutive_errors: number
          created_at: string
          date: string
          id: string
          is_paused: boolean
          last_message_at: string | null
          messages_sent: number
          pause_reason: string | null
          pause_until: string | null
          updated_at: string
        }
        Insert: {
          config_id: string
          consecutive_errors?: number
          created_at?: string
          date?: string
          id?: string
          is_paused?: boolean
          last_message_at?: string | null
          messages_sent?: number
          pause_reason?: string | null
          pause_until?: string | null
          updated_at?: string
        }
        Update: {
          config_id?: string
          consecutive_errors?: number
          created_at?: string
          date?: string
          id?: string
          is_paused?: boolean
          last_message_at?: string | null
          messages_sent?: number
          pause_reason?: string | null
          pause_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_limits_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instance_status: {
        Row: {
          checked_at: string | null
          config_id: string
          details: Json | null
          id: string
          status: string
        }
        Insert: {
          checked_at?: string | null
          config_id: string
          details?: Json | null
          id?: string
          status: string
        }
        Update: {
          checked_at?: string | null
          config_id?: string
          details?: Json | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instance_status_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_labels: {
        Row: {
          color: number | null
          created_at: string | null
          id: string
          label_id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: number | null
          created_at?: string | null
          id?: string
          label_id: string
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: number | null
          created_at?: string | null
          id?: string
          label_id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      whatsapp_logs: {
        Row: {
          config_id: string | null
          error_message: string | null
          id: string
          phone: string
          schedule_id: string | null
          sent_at: string | null
          status: string
          subscription_id: string | null
        }
        Insert: {
          config_id?: string | null
          error_message?: string | null
          id?: string
          phone: string
          schedule_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Update: {
          config_id?: string | null
          error_message?: string | null
          id?: string
          phone?: string
          schedule_id?: string | null
          sent_at?: string | null
          status?: string
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          edited_at: string | null
          id: string
          media_url: string | null
          message_id_whatsapp: string | null
          message_type: string
          sent_by_user_id: string | null
          status: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          edited_at?: string | null
          id?: string
          media_url?: string | null
          message_id_whatsapp?: string | null
          message_type?: string
          sent_by_user_id?: string | null
          status?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          edited_at?: string | null
          id?: string
          media_url?: string | null
          message_id_whatsapp?: string | null
          message_type?: string
          sent_by_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_sent_by_user_id_fkey"
            columns: ["sent_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      whatsapp_protection_settings: {
        Row: {
          auto_blacklist_enabled: boolean
          batch_size: number
          block_detection_enabled: boolean
          business_hours_enabled: boolean
          business_hours_end: string
          business_hours_start: string
          created_at: string
          daily_limit_normal: number
          daily_limit_warmup: number
          id: string
          max_consecutive_errors: number
          max_delay_seconds: number
          min_delay_seconds: number
          pause_after_batch_minutes: number
          updated_at: string
          warmup_days: number
        }
        Insert: {
          auto_blacklist_enabled?: boolean
          batch_size?: number
          block_detection_enabled?: boolean
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          daily_limit_normal?: number
          daily_limit_warmup?: number
          id?: string
          max_consecutive_errors?: number
          max_delay_seconds?: number
          min_delay_seconds?: number
          pause_after_batch_minutes?: number
          updated_at?: string
          warmup_days?: number
        }
        Update: {
          auto_blacklist_enabled?: boolean
          batch_size?: number
          block_detection_enabled?: boolean
          business_hours_enabled?: boolean
          business_hours_end?: string
          business_hours_start?: string
          created_at?: string
          daily_limit_normal?: number
          daily_limit_warmup?: number
          id?: string
          max_consecutive_errors?: number
          max_delay_seconds?: number
          min_delay_seconds?: number
          pause_after_batch_minutes?: number
          updated_at?: string
          warmup_days?: number
        }
        Relationships: []
      }
      whatsapp_queue: {
        Row: {
          attempts: number | null
          broadcast_list_id: string | null
          config_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          image_url: string | null
          lead_data: Json | null
          message: string
          phone: string
          processed_at: string | null
          schedule_id: string | null
          status: string
          updated_at: string | null
          warning_message: string | null
        }
        Insert: {
          attempts?: number | null
          broadcast_list_id?: string | null
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          lead_data?: Json | null
          message: string
          phone: string
          processed_at?: string | null
          schedule_id?: string | null
          status?: string
          updated_at?: string | null
          warning_message?: string | null
        }
        Update: {
          attempts?: number | null
          broadcast_list_id?: string | null
          config_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          image_url?: string | null
          lead_data?: Json | null
          message?: string
          phone?: string
          processed_at?: string | null
          schedule_id?: string | null
          status?: string
          updated_at?: string | null
          warning_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_schedules: {
        Row: {
          apply_label_id: string | null
          created_at: string | null
          days_of_week: number[]
          id: string
          image_url: string | null
          is_active: boolean | null
          manual_phones: string[] | null
          message_template: string
          name: string
          send_time: string
          updated_at: string | null
        }
        Insert: {
          apply_label_id?: string | null
          created_at?: string | null
          days_of_week?: number[]
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          manual_phones?: string[] | null
          message_template: string
          name: string
          send_time: string
          updated_at?: string | null
        }
        Update: {
          apply_label_id?: string | null
          created_at?: string | null
          days_of_week?: number[]
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          manual_phones?: string[] | null
          message_template?: string
          name?: string
          send_time?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_expired_cache: { Args: never; Returns: undefined }
      clean_old_instance_status: { Args: never; Returns: undefined }
      get_pending_broadcast_messages: {
        Args: { batch_limit: number }
        Returns: {
          attempts: number | null
          broadcast_list_id: string | null
          config_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          image_url: string | null
          lead_data: Json | null
          message: string
          phone: string
          processed_at: string | null
          schedule_id: string | null
          status: string
          updated_at: string | null
          warning_message: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "whatsapp_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "sdr" | "closer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "sdr", "closer"],
    },
  },
} as const

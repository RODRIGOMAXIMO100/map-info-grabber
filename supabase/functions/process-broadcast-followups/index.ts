import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Invisible characters for message variation
const INVISIBLE_CHARS = [
  '\u200B', // Zero-width space
  '\u200C', // Zero-width non-joiner
  '\u200D', // Zero-width joiner
  '\uFEFF', // Zero-width no-break space
];

// Add invisible character variation to message
const addInvisibleVariation = (message: string): string => {
  const randomChar = INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
  const position = Math.random();
  
  if (position < 0.33) {
    return randomChar + message;
  } else if (position < 0.66) {
    return message + randomChar;
  } else {
    const insertPoint = message.indexOf('. ');
    if (insertPoint > 0) {
      return message.slice(0, insertPoint + 2) + randomChar + message.slice(insertPoint + 2);
    }
    return message + randomChar;
  }
};

// Process spintax: {option1|option2|option3} -> randomly selected option
const processSpintax = (text: string): string => {
  return text.replace(/\{([^{}]*\|[^{}]*)\}/g, (match, group) => {
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)];
  });
};

// Replace dynamic variables in message
const replaceVariables = (message: string, conversation: { name?: string | null }): string => {
  let result = message;
  result = result.replace(/{nome_empresa}/g, conversation.name || 'sua empresa');
  result = result.replace(/{nome}/g, conversation.name || 'você');
  return result;
};

// WhatsApp config interface
interface WhatsAppConfig {
  id: string;
  server_url: string;
  instance_token: string;
  instance_phone: string | null;
  name: string | null;
  is_active: boolean;
}

interface FollowupTemplate {
  id: string;
  followup_number: number;
  hours_after_broadcast: number;
  message_template: string;
  is_active: boolean;
}

interface ConversationForFollowup {
  id: string;
  phone: string;
  name: string | null;
  config_id: string | null;
  broadcast_list_id: string;
  broadcast_sent_at: string;
  followup_count: number;
  last_lead_message_at: string | null;
}

// Check if current time is within business hours (using Brasília time UTC-3)
const isWithinBusinessHours = (startHour: string, endHour: string): boolean => {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utcTime + (brasiliaOffset * 60000));
  
  const currentHour = brasiliaTime.getHours();
  const currentMinute = brasiliaTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  const [startH, startM] = startHour.slice(0, 5).split(':').map(Number);
  const [endH, endM] = endHour.slice(0, 5).split(':').map(Number);
  const startTimeMinutes = startH * 60 + startM;
  const endTimeMinutes = endH * 60 + endM;
  
  return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[BroadcastFollowups] Starting follow-up processing...');

    // Load protection settings for business hours
    const { data: settingsData } = await supabase
      .from('whatsapp_protection_settings')
      .select('business_hours_enabled, business_hours_start, business_hours_end')
      .limit(1)
      .single();

    // Check business hours
    if (settingsData?.business_hours_enabled) {
      if (!isWithinBusinessHours(settingsData.business_hours_start, settingsData.business_hours_end)) {
        console.log('[BroadcastFollowups] Outside business hours, skipping');
        return new Response(
          JSON.stringify({ success: true, message: 'Outside business hours', sent: 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Load active follow-up templates
    const { data: templates, error: templatesError } = await supabase
      .from('broadcast_followup_templates')
      .select('*')
      .eq('is_active', true)
      .order('followup_number', { ascending: true });

    if (templatesError) throw templatesError;

    if (!templates || templates.length === 0) {
      console.log('[BroadcastFollowups] No active follow-up templates found');
      return new Response(
        JSON.stringify({ success: true, message: 'No templates', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[BroadcastFollowups] Found ${templates.length} active templates`);

    // Get first active WhatsApp config
    const { data: whatsappConfig, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, server_url, instance_token, instance_phone, name, is_active')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (configError || !whatsappConfig) {
      console.log('[BroadcastFollowups] No active WhatsApp config');
      return new Response(
        JSON.stringify({ success: false, error: 'No active WhatsApp config' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find conversations that:
    // 1. Came from a broadcast (broadcast_sent_at is set)
    // 2. Lead never responded (last_lead_message_at is NULL)
    // 3. Haven't received all follow-ups yet (followup_count < 2)
    const { data: conversations, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone, name, config_id, broadcast_list_id, broadcast_sent_at, followup_count, last_lead_message_at')
      .not('broadcast_sent_at', 'is', null)
      .is('last_lead_message_at', null)
      .lt('followup_count', 2)
      .eq('is_crm_lead', true);

    if (convError) throw convError;

    if (!conversations || conversations.length === 0) {
      console.log('[BroadcastFollowups] No conversations pending follow-up');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending follow-ups', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[BroadcastFollowups] Found ${conversations.length} conversations to check`);

    let sentCount = 0;
    let skippedCount = 0;
    const now = new Date();

    for (const conv of conversations) {
      if (!conv.broadcast_sent_at) continue;

      const broadcastSentAt = new Date(conv.broadcast_sent_at);
      const hoursSinceBroadcast = (now.getTime() - broadcastSentAt.getTime()) / (1000 * 60 * 60);
      const currentFollowupCount = conv.followup_count || 0;

      // Determine which follow-up to send
      // followup_count = 0 -> send followup_number 2 (after 48h)
      // followup_count = 1 -> send followup_number 3 (after 72h)
      const nextFollowupNumber = currentFollowupCount + 2; // 0->2, 1->3
      
      const template = templates.find(t => t.followup_number === nextFollowupNumber);
      if (!template) {
        console.log(`[BroadcastFollowups] No template for followup ${nextFollowupNumber}`);
        continue;
      }

      // Check if enough time has passed
      if (hoursSinceBroadcast < template.hours_after_broadcast) {
        console.log(`[BroadcastFollowups] Conv ${conv.id}: Only ${hoursSinceBroadcast.toFixed(1)}h passed, need ${template.hours_after_broadcast}h`);
        skippedCount++;
        continue;
      }

      console.log(`[BroadcastFollowups] Sending follow-up ${template.followup_number} to ${conv.phone} (${hoursSinceBroadcast.toFixed(1)}h since broadcast)`);

      try {
        // Process message
        let message = template.message_template;
        message = replaceVariables(message, { name: conv.name });
        message = processSpintax(message);
        message = addInvisibleVariation(message);

        // Format phone
        let formattedPhone = conv.phone.replace(/\D/g, '');
        if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
          formattedPhone = '55' + formattedPhone;
        }

        // Send message via UAZAPI
        const sendUrl = `${whatsappConfig.server_url}/send/text`;
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': whatsappConfig.instance_token
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: message
          })
        });

        const result = await sendResponse.json();

        if (sendResponse.ok && result.success !== false) {
          // Success - update conversation
          const newFollowupCount = currentFollowupCount + 1;
          const updateData: Record<string, unknown> = {
            followup_count: newFollowupCount,
            last_followup_at: now.toISOString(),
            last_message_at: now.toISOString(),
            last_message_preview: message.substring(0, 100),
            updated_at: now.toISOString()
          };

          // If this was the last follow-up (followup 3), move to nurturing stage
          if (template.followup_number === 3) {
            updateData.funnel_stage = 'nurturing';
            updateData.tags = ['nurturing'];
            console.log(`[BroadcastFollowups] Moving ${conv.phone} to nurturing stage after final follow-up`);
          }

          await supabase
            .from('whatsapp_conversations')
            .update(updateData)
            .eq('id', conv.id);

          // Log message in chat history
          await supabase
            .from('whatsapp_messages')
            .insert({
              conversation_id: conv.id,
              direction: 'outgoing',
              message_type: 'text',
              content: message,
              status: 'sent',
              message_id_whatsapp: result.key?.id || null
            });

          sentCount++;
          console.log(`[BroadcastFollowups] ✓ Sent follow-up ${template.followup_number} to ${conv.phone}`);

          // Small delay between messages
          await new Promise(resolve => setTimeout(resolve, 5000));

        } else {
          console.error(`[BroadcastFollowups] ✗ Failed to send to ${conv.phone}:`, result.error || result.message);
        }

      } catch (sendError) {
        console.error(`[BroadcastFollowups] Error sending to ${conv.phone}:`, sendError);
      }
    }

    console.log(`[BroadcastFollowups] Summary: ${sentCount} sent, ${skippedCount} skipped (not ready yet)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount,
        skipped: skippedCount,
        checked: conversations.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[BroadcastFollowups] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

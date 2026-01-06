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

// Replace dynamic variables in message with lead data
const replaceVariables = (message: string, leadData: Record<string, unknown> | null): string => {
  if (!leadData) return message;
  let result = message;
  result = result.replace(/{nome_empresa}/g, String(leadData.name || 'sua empresa'));
  result = result.replace(/{cidade}/g, String(leadData.city || ''));
  result = result.replace(/{estado}/g, String(leadData.state || ''));
  result = result.replace(/{rating}/g, String(leadData.rating || ''));
  result = result.replace(/{website}/g, String(leadData.website || ''));
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
  warmup_started_at: string | null;
}

interface ProtectionSettings {
  daily_limit_warmup: number;
  daily_limit_normal: number;
  warmup_days: number;
  batch_size: number;
  pause_after_batch_minutes: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  auto_blacklist_enabled: boolean;
  block_detection_enabled: boolean;
  max_consecutive_errors: number;
}

interface InstanceLimit {
  id: string;
  config_id: string;
  date: string;
  messages_sent: number;
  last_message_at: string | null;
  consecutive_errors: number;
  is_paused: boolean;
  pause_until: string | null;
  pause_reason: string | null;
}

// Check if current time is within business hours (using Brasília time UTC-3)
const isWithinBusinessHours = (settings: ProtectionSettings): boolean => {
  if (!settings.business_hours_enabled) return true;
  
  // Get current time in Brasília (UTC-3)
  const now = new Date();
  const brasiliaOffset = -3 * 60; // UTC-3 in minutes
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utcTime + (brasiliaOffset * 60000));
  
  const currentHour = brasiliaTime.getHours();
  const currentMinute = brasiliaTime.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  
  // Parse business hours
  const [startHour, startMin] = settings.business_hours_start.slice(0, 5).split(':').map(Number);
  const [endHour, endMin] = settings.business_hours_end.slice(0, 5).split(':').map(Number);
  const startTimeMinutes = startHour * 60 + startMin;
  const endTimeMinutes = endHour * 60 + endMin;
  
  console.log(`[Broadcast] Brasília time: ${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}, Business hours: ${settings.business_hours_start.slice(0, 5)} - ${settings.business_hours_end.slice(0, 5)}`);
  
  return currentTimeMinutes >= startTimeMinutes && currentTimeMinutes <= endTimeMinutes;
};

// Check if instance is in warmup period
const isInWarmup = (config: WhatsAppConfig, settings: ProtectionSettings): boolean => {
  // If warmup_started_at is NULL, treat as warmed up (legacy instances)
  // New instances will always have warmup_started_at set to NOW() on creation
  if (!config.warmup_started_at) return false;
  
  const warmupStart = new Date(config.warmup_started_at);
  const now = new Date();
  const daysSinceStart = Math.floor((now.getTime() - warmupStart.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysSinceStart < settings.warmup_days;
};

// Get daily limit for an instance
const getDailyLimit = (config: WhatsAppConfig, settings: ProtectionSettings): number => {
  return isInWarmup(config, settings) ? settings.daily_limit_warmup : settings.daily_limit_normal;
};

// Generate random delay between min and max
const getRandomDelay = (settings: ProtectionSettings): number => {
  const minMs = settings.min_delay_seconds * 1000;
  const maxMs = settings.max_delay_seconds * 1000;
  return minMs + Math.random() * (maxMs - minMs);
};

// Check if error indicates blocking
const isBlockingError = (errorMessage: string): boolean => {
  const blockKeywords = [
    'blocked', 'banned', 'suspended', 'rate limit',
    'too many requests', 'spam', 'temporary ban'
  ];
  const lowerError = errorMessage.toLowerCase();
  return blockKeywords.some(keyword => lowerError.includes(keyword));
};

// Check if error is "innocent" (problem with the number, not the instance)
const isInnocentError = (errorMessage: string): boolean => {
  const innocentKeywords = [
    'not on whatsapp', 'not registered', 'invalid phone',
    'phone number not found', 'number not found', 'not a valid',
    'número não encontrado', 'não está no whatsapp',
    'invalid number', 'does not exist', 'not exist',
    // UAZAPI specific patterns
    'jid not valid', 'número inválido', 'not a valid phone',
    '401', 'unauthorized', 'true' // "true" = erro genérico boolean
  ];
  const lowerError = errorMessage.toLowerCase();
  return innocentKeywords.some(keyword => lowerError.includes(keyword));
};

// Check if a phone number exists on WhatsApp using UAZAPI
const checkNumberOnWhatsApp = async (
  serverUrl: string,
  token: string,
  phone: string
): Promise<{ exists: boolean; formattedNumber: string | null }> => {
  try {
    // Format phone for checking
    let formattedPhone = phone.replace(/\D/g, '');
    if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
      formattedPhone = '55' + formattedPhone;
    }

    // Quick validation: landline numbers typically have 10 digits (with DDD) and don't start with 9 in the local part
    // Mobile numbers in Brazil have 11 digits (with DDD) and local part starts with 9
    const localNumber = formattedPhone.startsWith('55') ? formattedPhone.slice(4) : formattedPhone.slice(2);
    if (localNumber.length === 8 && !localNumber.startsWith('9')) {
      console.log(`[NumberCheck] ${phone} appears to be a landline (8 digits, no 9 prefix)`);
      return { exists: false, formattedNumber: null };
    }

    // Call UAZAPI to check if number exists
    const checkUrl = `${serverUrl}/contact/check`;
    const response = await fetch(checkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': token
      },
      body: JSON.stringify({ number: formattedPhone })
    });

    if (!response.ok) {
      console.log(`[NumberCheck] API error for ${phone}: ${response.status}`);
      // If API fails, assume number exists to avoid false negatives
      return { exists: true, formattedNumber: formattedPhone };
    }

    const result = await response.json();
    
    // UAZAPI returns { exists: true/false, jid: "number@s.whatsapp.net" }
    const exists = result.exists === true || result.numberExists === true || result.onWhatsApp === true;
    
    console.log(`[NumberCheck] ${phone} -> exists: ${exists}`);
    return { 
      exists, 
      formattedNumber: exists ? (result.jid?.split('@')[0] || formattedPhone) : null 
    };
  } catch (error) {
    console.error(`[NumberCheck] Error checking ${phone}:`, error);
    // On error, assume exists to avoid false negatives
    return { exists: true, formattedNumber: phone.replace(/\D/g, '') };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============= RECOVERY: Reset stuck messages =============
    // Messages stuck in 'processing' for more than 5 minutes are orphaned
    // Reset them back to 'pending' so they can be retried
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: stuckMessages, error: stuckError } = await supabase
      .from('whatsapp_queue')
      .update({ 
        status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'processing')
      .lt('updated_at', fiveMinutesAgo)
      .select('id, attempts');

    if (stuckError) {
      console.error('[Broadcast] Error recovering stuck messages:', stuckError);
    } else if (stuckMessages && stuckMessages.length > 0) {
      console.log(`[Broadcast] ♻️ Recovered ${stuckMessages.length} stuck messages`);
      
      // Check for messages that have been stuck too many times (3+) and mark as failed
      for (const stuck of stuckMessages) {
        const currentAttempts = (stuck.attempts || 0) + 1;
        if (currentAttempts >= 3) {
          await supabase
            .from('whatsapp_queue')
            .update({ 
              status: 'failed', 
              error_message: 'Mensagem travou múltiplas vezes (timeout)',
              attempts: currentAttempts
            })
            .eq('id', stuck.id);
          console.log(`[Broadcast] ❌ Message ${stuck.id} failed after ${currentAttempts} stuck attempts`);
        } else {
          // Increment attempts counter
          await supabase
            .from('whatsapp_queue')
            .update({ attempts: currentAttempts })
            .eq('id', stuck.id);
        }
      }
    }
    // ============= END RECOVERY =============

    // Load protection settings
    const { data: settingsData } = await supabase
      .from('whatsapp_protection_settings')
      .select('*')
      .limit(1)
      .single();

    const settings: ProtectionSettings = settingsData || {
      daily_limit_warmup: 30,
      daily_limit_normal: 200,
      warmup_days: 7,
      batch_size: 40,
      pause_after_batch_minutes: 45,
      min_delay_seconds: 15,
      max_delay_seconds: 45,
      business_hours_enabled: true,
      business_hours_start: '08:00:00',
      business_hours_end: '20:00:00',
      auto_blacklist_enabled: true,
      block_detection_enabled: true,
      max_consecutive_errors: 5
    };

    // Check business hours
    if (!isWithinBusinessHours(settings)) {
      console.log('[Broadcast] Outside business hours, skipping');
      return new Response(
        JSON.stringify({ success: true, message: 'Outside business hours', sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's date for limit tracking
    const today = new Date().toISOString().split('T')[0];

    // Get ALL active WhatsApp configurations
    const { data: activeConfigs, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, server_url, instance_token, instance_phone, name, is_active, warmup_started_at')
      .eq('is_active', true);

    if (configError) throw configError;

    if (!activeConfigs || activeConfigs.length === 0) {
      console.log('[Broadcast] No active WhatsApp configurations found');
      return new Response(
        JSON.stringify({ success: false, error: 'No active WhatsApp configurations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Broadcast] Found ${activeConfigs.length} active WhatsApp instances`);

    // Get/create today's limits for each instance
    const instanceLimits: Map<string, InstanceLimit> = new Map();
    
    for (const config of activeConfigs) {
      const { data: existingLimit } = await supabase
        .from('whatsapp_instance_limits')
        .select('*')
        .eq('config_id', config.id)
        .eq('date', today)
        .maybeSingle();

      if (existingLimit) {
        instanceLimits.set(config.id, existingLimit);
      } else {
        // Create new limit record for today
        const { data: newLimit } = await supabase
          .from('whatsapp_instance_limits')
          .insert({
            config_id: config.id,
            date: today,
            messages_sent: 0
          })
          .select()
          .single();
        
        if (newLimit) {
          instanceLimits.set(config.id, newLimit);
        }
      }
    }

    // Filter available instances (not paused, not at limit)
    const availableConfigs = activeConfigs.filter(config => {
      const limit = instanceLimits.get(config.id);
      if (!limit) return false;
      
      // Check if paused
      if (limit.is_paused) {
        if (limit.pause_until) {
          const pauseUntil = new Date(limit.pause_until);
          if (pauseUntil > new Date()) {
            console.log(`[Broadcast] Instance ${config.name} is paused until ${limit.pause_until}`);
            return false;
          }
          // Unpause if time has passed
          supabase
            .from('whatsapp_instance_limits')
            .update({ is_paused: false, pause_until: null, pause_reason: null })
            .eq('id', limit.id);
        } else {
          return false;
        }
      }
      
      // Check daily limit
      const dailyLimit = getDailyLimit(config as WhatsAppConfig, settings);
      if (limit.messages_sent >= dailyLimit) {
        console.log(`[Broadcast] Instance ${config.name} reached daily limit (${limit.messages_sent}/${dailyLimit})`);
        return false;
      }
      
      // Check if needs batch pause (every batch_size messages, pause for pause_after_batch_minutes)
      if (limit.messages_sent > 0 && limit.messages_sent % settings.batch_size === 0) {
        const lastMsgTime = limit.last_message_at ? new Date(limit.last_message_at) : null;
        if (lastMsgTime) {
          const pauseEndTime = new Date(lastMsgTime.getTime() + settings.pause_after_batch_minutes * 60 * 1000);
          if (pauseEndTime > new Date()) {
            console.log(`[Broadcast] Instance ${config.name} in batch pause until ${pauseEndTime.toISOString()}`);
            return false;
          }
        }
      }
      
      return true;
    }) as WhatsAppConfig[];

    if (availableConfigs.length === 0) {
      console.log('[Broadcast] No available instances (all paused or at limit)');
      return new Response(
        JSON.stringify({ success: true, message: 'All instances paused or at limit', sent: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Broadcast] ${availableConfigs.length} instances available for sending`);

    // Get blacklisted phones
    const { data: blacklist } = await supabase
      .from('whatsapp_blacklist')
      .select('phone');
    
    const blacklistedPhones = new Set(blacklist?.map(b => b.phone.replace(/\D/g, '')) || []);
    console.log(`[Broadcast] Loaded ${blacklistedPhones.size} blacklisted phones`);

    // ============= LOAD PAUSED BROADCASTS =============
    // Cache all paused/draft broadcasts to check before sending each message
    const { data: pausedBroadcasts } = await supabase
      .from('broadcast_lists')
      .select('id')
      .in('status', ['paused', 'draft']);
    
    const pausedBroadcastIds = new Set((pausedBroadcasts || []).map(b => b.id));
    console.log(`[Broadcast] Found ${pausedBroadcastIds.size} paused/draft broadcasts`);
    // ============= END LOAD PAUSED BROADCASTS =============

    // Get pending messages atomically using FOR UPDATE SKIP LOCKED to prevent race conditions
    // This function atomically selects AND updates status to 'processing' in a single transaction
    const { data: pendingMessages, error: fetchError } = await supabase
      .rpc('get_pending_broadcast_messages', { batch_limit: settings.batch_size });

    if (fetchError) {
      console.error('[Broadcast] Error fetching pending messages:', fetchError);
      throw fetchError;
    }

    console.log('[Broadcast] Found pending messages:', pendingMessages?.length || 0);

    let sentCount = 0;
    let failedCount = 0;
    let skippedBlacklist = 0;
    let skippedInvalidNumber = 0;
    let skippedPaused = 0;
    let configIndex = 0;

    for (const queueItem of pendingMessages || []) {
      // ============= CHECK IF BROADCAST IS PAUSED =============
      if (queueItem.broadcast_list_id && pausedBroadcastIds.has(queueItem.broadcast_list_id)) {
        console.log(`[Broadcast] ⏸️ Broadcast ${queueItem.broadcast_list_id} is paused, reverting message ${queueItem.id} to pending`);
        await supabase
          .from('whatsapp_queue')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', queueItem.id);
        skippedPaused++;
        continue;
      }
      // ============= END CHECK IF BROADCAST IS PAUSED =============

      // Check blacklist
      const normalizedPhone = queueItem.phone.replace(/\D/g, '');
      if (blacklistedPhones.has(normalizedPhone)) {
        console.log(`[Broadcast] Skipping blacklisted phone: ${queueItem.phone}`);
        await supabase
          .from('whatsapp_queue')
          .update({ status: 'failed', error_message: 'Número na blacklist' })
          .eq('id', queueItem.id);
        skippedBlacklist++;
        continue;
      }

      // ============= DUPLICATE CHECK =============
      // Check if this phone already received a message from this broadcast in the last 24 hours
      if (queueItem.broadcast_list_id) {
        const { data: existingSent } = await supabase
          .from('whatsapp_queue')
          .select('id')
          .eq('phone', queueItem.phone)
          .eq('broadcast_list_id', queueItem.broadcast_list_id)
          .eq('status', 'sent')
          .neq('id', queueItem.id)
          .limit(1)
          .maybeSingle();

        if (existingSent) {
          console.log(`[Broadcast] Skipping duplicate: phone ${queueItem.phone} already received message from broadcast ${queueItem.broadcast_list_id}`);
          await supabase
            .from('whatsapp_queue')
            .update({ status: 'failed', error_message: 'Duplicata: já enviado para este número neste broadcast' })
            .eq('id', queueItem.id);
          continue;
        }
      }
      // ============= END DUPLICATE CHECK =============

      // Round-robin: select config FIRST (needed for number verification)
      const selectedConfig = availableConfigs[configIndex % availableConfigs.length];
      configIndex++;

      const limit = instanceLimits.get(selectedConfig.id);
      if (!limit) continue;

      // Check if this instance can still send
      const dailyLimit = getDailyLimit(selectedConfig, settings);
      if (limit.messages_sent >= dailyLimit) {
        console.log(`[Broadcast] Instance ${selectedConfig.name} hit limit during batch, skipping`);
        continue;
      }

      // ============= NUMBER VERIFICATION =============
      // Check if number exists on WhatsApp BEFORE sending
      const numberCheck = await checkNumberOnWhatsApp(
        selectedConfig.server_url,
        selectedConfig.instance_token,
        queueItem.phone
      );

      if (!numberCheck.exists) {
        console.log(`[Broadcast] ⚠️ Skipping ${queueItem.phone} - number not on WhatsApp`);
        await supabase
          .from('whatsapp_queue')
          .update({ 
            status: 'failed', 
            error_message: 'Número não encontrado no WhatsApp',
            processed_at: new Date().toISOString()
          })
          .eq('id', queueItem.id);
        
        // Update broadcast list counter
        if (queueItem.broadcast_list_id) {
          const { data: list } = await supabase
            .from('broadcast_lists')
            .select('failed_count')
            .eq('id', queueItem.broadcast_list_id)
            .single();
          
          await supabase
            .from('broadcast_lists')
            .update({ failed_count: (list?.failed_count || 0) + 1 })
            .eq('id', queueItem.broadcast_list_id);
        }

        skippedInvalidNumber++;
        continue;
      }
      // ============= END NUMBER VERIFICATION =============

      console.log(`[Broadcast] Sending via ${selectedConfig.name || selectedConfig.instance_phone} (${limit.messages_sent + 1}/${dailyLimit})`);

      try {
        // Update attempts and config_id (status already set to 'processing' by RPC)
        await supabase
          .from('whatsapp_queue')
          .update({ 
            attempts: (queueItem.attempts || 0) + 1,
            config_id: selectedConfig.id
          })
          .eq('id', queueItem.id);

        // Process message with anti-blocking techniques
        let processedMessage = queueItem.message;
        processedMessage = replaceVariables(processedMessage, queueItem.lead_data as Record<string, unknown> | null);
        processedMessage = processSpintax(processedMessage);
        processedMessage = addInvisibleVariation(processedMessage);

        // Format phone number - normalize to always have 55 prefix
        let formattedPhone = queueItem.phone.replace(/\D/g, '');
        // Brazilian numbers: 10 digits (landline) or 11 digits (mobile) without country code
        if (!formattedPhone.startsWith('55') && (formattedPhone.length === 10 || formattedPhone.length === 11)) {
          formattedPhone = '55' + formattedPhone;
        }

        // Build the API URL and payload
        let apiUrl: string;
        let payload: Record<string, unknown>;

        if (queueItem.image_url) {
          apiUrl = `${selectedConfig.server_url}/send/media`;
          payload = {
            number: formattedPhone,
            type: 'image',
            file: queueItem.image_url,
            text: processedMessage
          };
        } else {
          apiUrl = `${selectedConfig.server_url}/send/text`;
          payload = {
            number: formattedPhone,
            text: processedMessage
          };
        }

        const sendResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'token': selectedConfig.instance_token
          },
          body: JSON.stringify(payload)
        });

        const result = await sendResponse.json();

        if (sendResponse.ok && (result.success !== false)) {
          // Success - update queue and limits
          await supabase
            .from('whatsapp_queue')
            .update({ status: 'sent', processed_at: new Date().toISOString() })
            .eq('id', queueItem.id);

          // Update instance limits
          await supabase
            .from('whatsapp_instance_limits')
            .update({ 
              messages_sent: limit.messages_sent + 1,
              last_message_at: new Date().toISOString(),
              consecutive_errors: 0
            })
            .eq('id', limit.id);

          limit.messages_sent++;
          limit.consecutive_errors = 0;

          // Log success
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'sent',
              config_id: selectedConfig.id
            });

          // Create/update conversation - MARCA COMO CRM LEAD
          // Busca flexível: usa últimos 8 dígitos para encontrar conversa
          // (resolve problema de nono dígito: 553499595399 vs 5534999595399)
          const phoneCore = formattedPhone.slice(-8);
          console.log(`[BROADCAST] Buscando conversa com phoneCore: %${phoneCore} (original: ${formattedPhone})`);
          
          const { data: existingConvs } = await supabase
            .from('whatsapp_conversations')
            .select('id, is_crm_lead, phone')
            .ilike('phone', `%${phoneCore}`);
          
          const existingConv = existingConvs?.[0] || null;
          if (existingConv) {
            console.log(`[BROADCAST] Conversa encontrada: ${existingConv.phone} (ID: ${existingConv.id})`);
          } else {
            console.log(`[BROADCAST] Nenhuma conversa encontrada, criando nova com: ${formattedPhone}`);
          }

          let conversationId: string;
          const leadData = queueItem.lead_data as Record<string, unknown> | null;

          // Buscar o dna_id da broadcast list se existir
          let dnaId: string | null = null;
          if (queueItem.broadcast_list_id) {
            const { data: broadcastList } = await supabase
              .from('broadcast_lists')
              .select('dna_id')
              .eq('id', queueItem.broadcast_list_id)
              .maybeSingle();
            dnaId = broadcastList?.dna_id || null;
          }

          if (existingConv) {
            conversationId = existingConv.id;
            // Se já existe, marca como CRM lead e atualiza
            // Reset followup_count e salva dados do broadcast
            await supabase
              .from('whatsapp_conversations')
              .update({
                last_message_at: new Date().toISOString(),
                last_message_preview: processedMessage.substring(0, 100),
                config_id: selectedConfig.id,
                is_crm_lead: true, // MARCA COMO CRM LEAD
                tags: ['new'], // Coloca no funil - Lead Novo (string)
                funnel_stage: 'new',
                dna_id: dnaId || undefined,
                // Dados do broadcast para follow-ups automáticos
                broadcast_list_id: queueItem.broadcast_list_id,
                broadcast_sent_at: new Date().toISOString(),
                followup_count: 0,
                updated_at: new Date().toISOString()
              })
              .eq('id', conversationId);
          } else {
            // Nova conversa do broadcast = é CRM lead
            const { data: newConv } = await supabase
              .from('whatsapp_conversations')
              .insert({
                phone: formattedPhone,
                name: leadData?.name ? String(leadData.name) : null,
                config_id: selectedConfig.id,
                is_crm_lead: true, // MARCA COMO CRM LEAD
                tags: ['new'], // Coloca no funil - Lead Novo (string)
                funnel_stage: 'new',
                dna_id: dnaId,
                last_message_at: new Date().toISOString(),
                last_message_preview: processedMessage.substring(0, 100),
                status: 'active',
                // Dados do broadcast para follow-ups automáticos
                broadcast_list_id: queueItem.broadcast_list_id,
                broadcast_sent_at: new Date().toISOString(),
                followup_count: 0
              })
              .select('id')
              .single();
            
            if (newConv) conversationId = newConv.id;
          }

          // Register message in chat history
          if (conversationId!) {
            await supabase
              .from('whatsapp_messages')
              .insert({
                conversation_id: conversationId,
                direction: 'outgoing',
                message_type: queueItem.image_url ? 'image' : 'text',
                content: processedMessage,
                media_url: queueItem.image_url || null,
                status: 'sent',
                message_id_whatsapp: result.key?.id || null
              });
          }

          // Update broadcast list counters
          if (queueItem.broadcast_list_id) {
            const { data: list } = await supabase
              .from('broadcast_lists')
              .select('sent_count')
              .eq('id', queueItem.broadcast_list_id)
              .single();
            
            await supabase
              .from('broadcast_lists')
              .update({ sent_count: (list?.sent_count || 0) + 1 })
              .eq('id', queueItem.broadcast_list_id);
          }

          sentCount++;
          console.log(`[Broadcast] ✓ Sent to ${queueItem.phone} via ${selectedConfig.name}`);

        } else {
          throw new Error(result.error || result.message || 'Failed to send');
        }

        // Random delay between messages
        const delay = getRandomDelay(settings);
        console.log(`[Broadcast] Waiting ${Math.round(delay / 1000)}s before next message...`);
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        
        // Check if this is an "innocent" error (problem with the number, not the instance)
        const isInnocent = isInnocentError(errorMessage);
        
        console.log(`[Broadcast] Error details - Message: "${errorMessage}" | Is innocent: ${isInnocent}`);
        
        if (isInnocent) {
          // Innocent error: Don't increment consecutive_errors, don't pause instance
          console.log(`[Broadcast] ⓘ Innocent error (invalid number) for ${queueItem.phone}: ${errorMessage}`);
          // Don't update consecutive_errors - keep it as is
        } else {
          // Real error: Update consecutive errors and potentially pause
          console.error('[Broadcast] ✗ Real error sending to', queueItem.phone, ':', errorMessage);
          
          const newErrorCount = limit.consecutive_errors + 1;
          
          // Check for blocking
          if (settings.block_detection_enabled && isBlockingError(errorMessage)) {
            console.log(`[Broadcast] ⚠️ Blocking detected for ${selectedConfig.name}, pausing instance`);
            await supabase
              .from('whatsapp_instance_limits')
              .update({ 
                is_paused: true, 
                pause_reason: `Blocking detected: ${errorMessage}`,
                consecutive_errors: newErrorCount
              })
              .eq('id', limit.id);
          } else if (newErrorCount >= settings.max_consecutive_errors) {
            // Pause after too many consecutive errors
            const pauseUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min pause
            console.log(`[Broadcast] ⚠️ Too many errors for ${selectedConfig.name}, pausing until ${pauseUntil.toISOString()}`);
            await supabase
              .from('whatsapp_instance_limits')
              .update({ 
                is_paused: true, 
                pause_until: pauseUntil.toISOString(),
                pause_reason: `${newErrorCount} consecutive errors`,
                consecutive_errors: newErrorCount
              })
              .eq('id', limit.id);
          } else {
            await supabase
              .from('whatsapp_instance_limits')
              .update({ consecutive_errors: newErrorCount })
              .eq('id', limit.id);
          }

          limit.consecutive_errors = newErrorCount;
        }

        // Mark as failed if max attempts reached
        const newStatus = queueItem.attempts >= 2 ? 'failed' : 'pending';
        
        await supabase
          .from('whatsapp_queue')
          .update({ 
            status: newStatus,
            error_message: errorMessage,
            processed_at: newStatus === 'failed' ? new Date().toISOString() : null
          })
          .eq('id', queueItem.id);

        if (newStatus === 'failed') {
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'failed',
              error_message: errorMessage,
              config_id: selectedConfig.id
            });

          if (queueItem.broadcast_list_id) {
            const { data: list } = await supabase
              .from('broadcast_lists')
              .select('failed_count')
              .eq('id', queueItem.broadcast_list_id)
              .single();
            
            await supabase
              .from('broadcast_lists')
              .update({ failed_count: (list?.failed_count || 0) + 1 })
              .eq('id', queueItem.broadcast_list_id);
          }

          failedCount++;
        }
      }
    }

    // Check for completed broadcast lists
    const { data: sendingLists } = await supabase
      .from('broadcast_lists')
      .select('id')
      .eq('status', 'sending');

    for (const list of sendingLists || []) {
      const { count: pendingCount } = await supabase
        .from('whatsapp_queue')
        .select('*', { count: 'exact', head: true })
        .eq('broadcast_list_id', list.id)
        .in('status', ['pending', 'processing']);

      if (pendingCount === 0) {
        await supabase
          .from('broadcast_lists')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', list.id);
        
        console.log('[Broadcast] List completed:', list.id);
      }
    }

    console.log(`[Broadcast] Summary: ${sentCount} sent, ${failedCount} failed, ${skippedBlacklist} blacklisted, ${skippedInvalidNumber} invalid numbers, ${skippedPaused} paused`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        failed: failedCount,
        skipped_blacklist: skippedBlacklist,
        skipped_invalid_number: skippedInvalidNumber,
        skipped_paused: skippedPaused,
        instances_used: availableConfigs.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Broadcast] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

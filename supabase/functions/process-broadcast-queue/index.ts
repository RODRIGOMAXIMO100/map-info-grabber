import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5;
const MIN_DELAY_MS = 5000; // 5 seconds minimum
const MAX_DELAY_MS = 15000; // 15 seconds maximum

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
    // Add at beginning
    return randomChar + message;
  } else if (position < 0.66) {
    // Add at end
    return message + randomChar;
  } else {
    // Add in the middle (after first sentence or paragraph)
    const insertPoint = message.indexOf('. ');
    if (insertPoint > 0) {
      return message.slice(0, insertPoint + 2) + randomChar + message.slice(insertPoint + 2);
    }
    return message + randomChar;
  }
};

// Process spintax: {option1|option2|option3} -> randomly selected option
const processSpintax = (text: string): string => {
  return text.replace(/\{([^{}]+)\}/g, (match, group) => {
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

// Generate random delay between min and max
const getRandomDelay = (): number => {
  return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get ALL active WhatsApp configurations for round-robin distribution
    const { data: activeConfigs, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, server_url, instance_token, instance_phone, name, is_active')
      .eq('is_active', true);

    if (configError) throw configError;

    if (!activeConfigs || activeConfigs.length === 0) {
      console.log('[Broadcast] No active WhatsApp configurations found');
      return new Response(
        JSON.stringify({ success: false, error: 'No active WhatsApp configurations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Broadcast] Found ${activeConfigs.length} active WhatsApp instances for round-robin`);

    // Get pending messages from queue
    const { data: pendingMessages, error: fetchError } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) throw fetchError;

    console.log('[Broadcast] Found pending messages:', pendingMessages?.length || 0);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < (pendingMessages?.length || 0); i++) {
      const queueItem = pendingMessages![i];
      
      // Round-robin: select config based on message index
      const selectedConfig = activeConfigs[i % activeConfigs.length] as WhatsAppConfig;
      
      console.log(`[Broadcast] Message ${i + 1}/${pendingMessages!.length} → Instance: ${selectedConfig.name || selectedConfig.instance_phone}`);
      
      try {
        // Mark as processing and assign config_id
        await supabase
          .from('whatsapp_queue')
          .update({ 
            status: 'processing', 
            attempts: queueItem.attempts + 1,
            config_id: selectedConfig.id
          })
          .eq('id', queueItem.id);

        // Process message with all anti-blocking techniques
        let processedMessage = queueItem.message;
        
        // 1. Process spintax first
        processedMessage = processSpintax(processedMessage);
        
        // 2. Replace variables with lead data
        processedMessage = replaceVariables(
          processedMessage, 
          queueItem.lead_data as Record<string, unknown> | null
        );
        
        // 3. Add invisible character variation
        processedMessage = addInvisibleVariation(processedMessage);
        
        console.log('[Broadcast] Sending personalized message to:', queueItem.phone, 'via', selectedConfig.name);

        // Format phone number
        let formattedPhone = queueItem.phone.replace(/\D/g, '');
        if (formattedPhone.length === 11 && !formattedPhone.startsWith('55')) {
          formattedPhone = '55' + formattedPhone;
        }

        // Build the API URL and payload based on media type
        let apiUrl: string;
        let payload: Record<string, unknown>;

        if (queueItem.image_url) {
          // Send media message - UAZAPI format: /send/file/
          apiUrl = `${selectedConfig.server_url}/send/file/${selectedConfig.instance_token}`;
          payload = {
            phone: formattedPhone,
            url: queueItem.image_url,
            caption: processedMessage,
            fileName: 'image.jpg'
          };
          console.log(`[Broadcast] Sending media to: ${apiUrl}`);
        } else {
          // Send text message - UAZAPI format: /send/text/
          apiUrl = `${selectedConfig.server_url}/send/text/${selectedConfig.instance_token}`;
          payload = {
            phone: formattedPhone,
            message: processedMessage
          };
          console.log(`[Broadcast] Sending text to: ${apiUrl}`);
        }

        const sendResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await sendResponse.json();

        if (sendResponse.ok && (result.success !== false)) {
          // Mark as sent
          await supabase
            .from('whatsapp_queue')
            .update({ 
              status: 'sent', 
              processed_at: new Date().toISOString() 
            })
            .eq('id', queueItem.id);

          // Log success with config_id for monitoring
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'sent',
              config_id: selectedConfig.id
            });

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

        // Random delay between messages (5-15 seconds)
        const delay = getRandomDelay();
        console.log(`[Broadcast] Waiting ${Math.round(delay / 1000)}s before next message...`);
        await new Promise(resolve => setTimeout(resolve, delay));

      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        console.error('[Broadcast] ✗ Error sending to', queueItem.phone, ':', errorMessage);

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
          // Log failure with config_id for monitoring
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'failed',
              error_message: errorMessage,
              config_id: selectedConfig.id
            });

          // Update broadcast list counters
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

    console.log(`[Broadcast] Summary: ${sentCount} sent, ${failedCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: sentCount, 
        failed: failedCount,
        instances_used: activeConfigs.length
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

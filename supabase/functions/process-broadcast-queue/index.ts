import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 5;
const DELAY_BETWEEN_MESSAGES_MS = 3000;

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

    for (const queueItem of pendingMessages || []) {
      try {
        // Mark as processing
        await supabase
          .from('whatsapp_queue')
          .update({ status: 'processing', attempts: queueItem.attempts + 1 })
          .eq('id', queueItem.id);

        // Personalize message with lead data
        const personalizedMessage = replaceVariables(
          queueItem.message, 
          queueItem.lead_data as Record<string, unknown> | null
        );
        
        console.log('[Broadcast] Sending personalized message to:', queueItem.phone);

        // Send message
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            phone: queueItem.phone,
            message: personalizedMessage,
            media_url: queueItem.image_url,
            media_type: queueItem.image_url ? 'image' : undefined
          })
        });

        const result = await sendResponse.json();

        if (sendResponse.ok && result.success) {
          // Mark as sent
          await supabase
            .from('whatsapp_queue')
            .update({ 
              status: 'sent', 
              processed_at: new Date().toISOString() 
            })
            .eq('id', queueItem.id);

          // Log success
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'sent'
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
          console.log('[Broadcast] Sent message to:', queueItem.phone);
        } else {
          throw new Error(result.error || 'Failed to send');
        }

        // Delay between messages
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES_MS));

      } catch (sendError) {
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown error';
        console.error('[Broadcast] Error sending to', queueItem.phone, ':', errorMessage);

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
          // Log failure
          await supabase
            .from('whatsapp_logs')
            .insert({
              schedule_id: queueItem.schedule_id,
              phone: queueItem.phone,
              status: 'failed',
              error_message: errorMessage
            });

          // Update broadcast list counters
          if (queueItem.broadcast_list_id) {
            await supabase
              .from('broadcast_lists')
              .update({ failed_count: failedCount + 1 })
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

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, failed: failedCount }),
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

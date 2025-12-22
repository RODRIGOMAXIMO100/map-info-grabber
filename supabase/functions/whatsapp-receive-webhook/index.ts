import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel Stages - IA controla STAGE_1 a STAGE_4
const FUNNEL_LABELS = ['16', '13', '14', '20'];
const HANDOFF_LABEL = '21';

// Process AI response in background
async function processAIResponse(
  supabaseUrl: string,
  supabaseServiceKey: string,
  conversationId: string,
  messageContent: string,
  senderPhone: string,
  tags: string[],
  configId: string | null
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!aiConfig?.is_active) {
      console.log('[AI] Agent is not active, skipping');
      return;
    }

    const delaySeconds = aiConfig.auto_reply_delay_seconds || 5;
    console.log(`[AI] Waiting ${delaySeconds}s before responding...`);
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const allStageLabels = ['16', '13', '14', '20', '21', '22', '23'];
    const currentStageId = tags.find(tag => allStageLabels.includes(tag)) || '16';

    console.log('[AI] Calling AI agent for conversation:', conversationId, 'Stage:', currentStageId);
    
    const aiResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        incoming_message: messageContent,
        conversation_history: messages || [],
        current_stage_id: currentStageId
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI] Agent error:', aiResponse.status, errorText);
      return;
    }

    const aiResult = await aiResponse.json();
    console.log('[AI] Agent response:', aiResult);

    if (aiResult.error || aiResult.should_respond === false) {
      console.log('[AI] Agent indicated no response needed:', aiResult.error || aiResult.message);
      return;
    }

    if (aiResult.response) {
      console.log('[AI] Sending response to:', senderPhone);
      
      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          phone: senderPhone,
          message: aiResult.response,
          config_id: configId // Use same instance
        })
      });

      if (!sendResponse.ok) {
        const sendError = await sendResponse.text();
        console.error('[AI] Failed to send message:', sendError);
      } else {
        console.log('[AI] Message sent successfully');
      }

      if (aiResult.lead_name) {
        console.log('[AI] Lead name identified:', aiResult.lead_name);
        await supabase
          .from('whatsapp_conversations')
          .update({ name: aiResult.lead_name })
          .eq('id', conversationId);
      }

      if (aiResult.label_id && aiResult.label_id !== currentStageId) {
        console.log('[AI] Updating label to:', aiResult.label_id);
        
        const newTags = tags.filter(t => !allStageLabels.includes(t));
        newTags.push(aiResult.label_id);
        
        const updateData: Record<string, unknown> = { 
          tags: newTags,
          followup_count: 0,
          last_followup_at: null
        };
        
        if (aiResult.should_handoff || aiResult.label_id === HANDOFF_LABEL) {
          updateData.ai_paused = true;
          updateData.ai_handoff_reason = aiResult.handoff_reason || 'Lead qualificado para vendedor';
          console.log('[AI] Handoff triggered:', aiResult.handoff_reason);
        }
        
        await supabase
          .from('whatsapp_conversations')
          .update(updateData)
          .eq('id', conversationId);

        await fetch(`${supabaseUrl}/functions/v1/update-whatsapp-label`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            phone: senderPhone,
            label_id: aiResult.label_id
          })
        });
      } else {
        await supabase
          .from('whatsapp_conversations')
          .update({ 
            followup_count: 0, 
            last_followup_at: null 
          })
          .eq('id', conversationId);
      }

      if (aiResult.should_send_video && aiResult.video_url) {
        console.log('[AI] Sending video');
        await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            phone: senderPhone,
            message: '',
            media_url: aiResult.video_url,
            media_type: 'video',
            config_id: configId
          })
        });

        await supabase
          .from('whatsapp_conversations')
          .update({ video_sent: true })
          .eq('id', conversationId);
      }

      if (aiResult.should_send_site && aiResult.site_url) {
        console.log('[AI] Sending site link');
        await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            phone: senderPhone,
            message: `📊 Conheça nossos cases de sucesso: ${aiResult.site_url}`,
            config_id: configId
          })
        });

        await supabase
          .from('whatsapp_conversations')
          .update({ site_sent: true })
          .eq('id', conversationId);
      }
    }

  } catch (error) {
    console.error('[AI] Background processing error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get instance ID from URL query param
    const url = new URL(req.url);
    const instanceId = url.searchParams.get('instance');
    console.log('[Webhook] Instance ID from URL:', instanceId);

    const rawBody = await req.text();
    console.log('=== WEBHOOK RAW BODY ===');
    console.log(rawBody);
    
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('Failed to parse JSON:', parseError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('=== WEBHOOK PARSED ===');
    console.log('Event type:', payload.event || payload.EventType);

    // Extract the receiving instance phone number from UAZAPI payload
    // UAZAPI sends the owner phone (the instance phone) in the 'owner' field
    // Also check chat.owner and message.owner as fallbacks
    const instancePhone = 
      payload.owner ||
      payload.chat?.owner ||
      payload.message?.owner ||
      payload.instance?.phone || 
      payload.instance?.wuid?.replace(/@.*/, '') ||
      payload.to?.replace(/@.*/, '') ||
      payload.data?.to?.replace(/@.*/, '') ||
      payload.key?.remoteJid?.replace(/@.*/, '') ||
      null;
    
    console.log('[Webhook] Extracted instance phone:', instancePhone);

    // Validate instance exists if provided via URL param
    let configId: string | null = instanceId;
    if (instanceId) {
      const { data: configData } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('id', instanceId)
        .maybeSingle();
      
      if (!configData) {
        console.log('[Webhook] Instance ID not found, will try to find by phone');
        configId = null;
      }
    }

    // If no instance from URL param, try to find by the receiving phone number
    if (!configId && instancePhone) {
      // Normalize phone for comparison (remove non-digits)
      const normalizedInstancePhone = instancePhone.replace(/\D/g, '');
      
      // Try exact match first
      const { data: configByPhone } = await supabase
        .from('whatsapp_config')
        .select('id, instance_phone')
        .eq('is_active', true);
      
      if (configByPhone && configByPhone.length > 0) {
        // Find config where instance_phone matches (with normalization)
        const matchedConfig = configByPhone.find(config => {
          if (!config.instance_phone) return false;
          const normalizedConfigPhone = config.instance_phone.replace(/\D/g, '');
          // Check if either contains the other (handles country code variations)
          return normalizedConfigPhone.includes(normalizedInstancePhone) || 
                 normalizedInstancePhone.includes(normalizedConfigPhone) ||
                 normalizedConfigPhone === normalizedInstancePhone;
        });
        
        if (matchedConfig) {
          configId = matchedConfig.id;
          console.log('[Webhook] Found instance by phone number:', configId, 'Phone:', instancePhone);
        }
      }
    }

    // Fallback: use first active instance if still no match
    if (!configId) {
      const { data: activeConfig } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      
      if (activeConfig) {
        configId = activeConfig.id;
        console.log('[Webhook] Using first active instance as fallback:', configId);
      }
    }

    // Extract message data from UAZAPI format
    let messageData = null;
    
    if (payload.message) {
      messageData = payload.message;
    } else if (payload.event === 'messages.upsert' || payload.messages) {
      const messages = payload.messages || payload.data?.messages || [];
      if (messages.length > 0) messageData = messages[0];
    } else if (payload.data?.message) {
      messageData = payload.data.message;
    }

    if (!messageData) {
      return new Response(
        JSON.stringify({ success: true, message: 'No message to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const chatId = payload.chat?.wa_chatid || messageData.chatid || messageData.key?.remoteJid || '';
    const isGroup = payload.chat?.wa_isGroup === true || messageData.isGroup === true || chatId.includes('@g.us');
    const senderPhone = chatId.replace(/@s\.whatsapp\.net|@c\.us|@lid|@g\.us/g, '');
    const senderName = payload.chat?.wa_name || payload.chat?.name || messageData.senderName || messageData.pushName || '';
    
    const isFromMe = messageData.fromMe === true || messageData.key?.fromMe === true;

    let messageContent = '';
    let messageType = 'text';
    let mediaUrl = '';

    if (messageData.text) {
      messageContent = messageData.text;
    } else if (messageData.content) {
      messageContent = messageData.content;
    } else if (messageData.message?.conversation) {
      messageContent = messageData.message.conversation;
    } else if (messageData.message?.extendedTextMessage?.text) {
      messageContent = messageData.message.extendedTextMessage.text;
    }
    
    if (messageData.mediaType || messageData.type) {
      const type = messageData.mediaType || messageData.type;
      if (type === 'image' || messageData.message?.imageMessage) {
        messageType = 'image';
        messageContent = messageContent || '[Imagem]';
      } else if (type === 'audio' || type === 'ptt' || messageData.message?.audioMessage) {
        messageType = 'audio';
        messageContent = '[Áudio]';
      } else if (type === 'video' || messageData.message?.videoMessage) {
        messageType = 'video';
        messageContent = messageContent || '[Vídeo]';
      } else if (type === 'document' || messageData.message?.documentMessage) {
        messageType = 'document';
        messageContent = '[Documento/PDF]';
      }
    }

    const messageIdWhatsapp = messageData.messageid || messageData.id || messageData.key?.id || '';
    
    console.log('Extracted data:', { senderPhone, senderName, isFromMe, messageContent, messageType, messageIdWhatsapp, configId });

    // Check for duplicate message
    if (messageIdWhatsapp) {
      const { data: existing } = await supabase
        .from('whatsapp_messages')
        .select('id')
        .eq('message_id_whatsapp', messageIdWhatsapp)
        .maybeSingle();
      
      if (existing) {
        return new Response(
          JSON.stringify({ success: true, message: 'Message already processed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!senderPhone) {
      return new Response(
        JSON.stringify({ success: true, message: 'No sender phone' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find or create conversation
    let conversationId: string;
    let conversationTags: string[] = [];
    let aiPaused = false;
    let existingConfigId: string | null = null;
    
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tags, unread_count, ai_paused, config_id')
      .eq('phone', senderPhone)
      .maybeSingle();

    const messagePreview = messageContent.substring(0, 100);

    if (existingConv) {
      conversationId = existingConv.id;
      conversationTags = existingConv.tags || [];
      aiPaused = existingConv.ai_paused === true;
      existingConfigId = existingConv.config_id;
      
      const updateData: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
        status: 'active'
      };

      // Update config_id if not set and we have one now
      if (!existingConfigId && configId) {
        updateData.config_id = configId;
        existingConfigId = configId;
      }

      if (!isFromMe) {
        updateData.unread_count = (existingConv.unread_count || 0) + 1;
        updateData.last_lead_message_at = new Date().toISOString();
      }

      if (!isGroup && senderName) {
        updateData.name = senderName;
      }

      await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversationId);
    } else {
      conversationTags = ['16'];
      
      const { data: newConv, error: createError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: senderPhone,
          name: isGroup ? 'Grupo' : (senderName || null),
          is_group: isGroup,
          tags: conversationTags,
          last_message_at: new Date().toISOString(),
          last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
          last_lead_message_at: isFromMe ? null : new Date().toISOString(),
          unread_count: isFromMe ? 0 : 1,
          status: 'active',
          followup_count: 0,
          config_id: configId // Link to instance
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
      existingConfigId = configId;
    }

    // Save message
    await supabase
      .from('whatsapp_messages')
      .insert({
        conversation_id: conversationId,
        direction: isFromMe ? 'outgoing' : 'incoming',
        message_type: messageType,
        content: messageContent,
        media_url: mediaUrl || null,
        message_id_whatsapp: messageIdWhatsapp || null,
        status: isFromMe ? 'sent' : 'received'
      });

    // AI Integration
    const isInAIControlledStage = conversationTags.some(tag => FUNNEL_LABELS.includes(tag));

    // Broadcast filter
    const { data: broadcastLists } = await supabase
      .from('broadcast_lists')
      .select('phones');

    const { data: queueItems } = await supabase
      .from('whatsapp_queue')
      .select('phone');

    const broadcastPhones = new Set<string>();

    broadcastLists?.forEach(list => {
      (list.phones as string[] || []).forEach((phone: string) => {
        broadcastPhones.add(phone.replace(/\D/g, ''));
      });
    });

    queueItems?.forEach(item => {
      broadcastPhones.add(item.phone.replace(/\D/g, ''));
    });

    const senderNormalized = senderPhone.replace(/\D/g, '');
    const isFromBroadcast = broadcastPhones.has(senderNormalized);

    console.log('[AI] Broadcast check:', { 
      senderPhone: senderNormalized, 
      isFromBroadcast, 
      totalBroadcastPhones: broadcastPhones.size 
    });

    if (!isFromMe && !isGroup && messageContent && isInAIControlledStage && !aiPaused && isFromBroadcast) {
      console.log('[AI] Triggering background AI processing for conversation:', conversationId);
      
      processAIResponse(
        supabaseUrl,
        supabaseServiceKey,
        conversationId,
        messageContent,
        senderPhone,
        conversationTags,
        existingConfigId
      ).catch(err => console.error('[AI] Background processing failed:', err));
    } else {
      console.log('[AI] Skipping AI:', { 
        isFromMe, 
        isGroup, 
        hasContent: !!messageContent, 
        isInAIControlledStage, 
        aiPaused,
        isFromBroadcast
      });
    }

    return new Response(
      JSON.stringify({ success: true, conversation_id: conversationId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

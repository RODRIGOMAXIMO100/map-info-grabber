import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel Stages - IA controla STAGE_1 a STAGE_4
const FUNNEL_LABELS = ['16', '13', '14', '20']; // Labels que a IA controla
const HANDOFF_LABEL = '21'; // STAGE_5 - Vendedor assume

// Process AI response in background
async function processAIResponse(
  supabaseUrl: string,
  supabaseServiceKey: string,
  conversationId: string,
  messageContent: string,
  senderPhone: string,
  tags: string[]
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get AI config
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!aiConfig?.is_active) {
      console.log('[AI] Agent is not active, skipping');
      return;
    }

    // IA funciona 24 horas quando ativa - removida verificação de horário

    // Wait for the configured delay (simulates human reading time)
    const delaySeconds = aiConfig.auto_reply_delay_seconds || 5;
    console.log(`[AI] Waiting ${delaySeconds}s before responding...`);
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

    // Get conversation history
    const { data: messages } = await supabase
      .from('whatsapp_messages')
      .select('direction, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Get current stage from tags
    const allStageLabels = ['16', '13', '14', '20', '21', '22', '23'];
    const currentStageId = tags.find(tag => allStageLabels.includes(tag)) || '16';

    // Call AI agent
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

    // Se IA indicou que não deve responder (handoff ou erro)
    if (aiResult.error || aiResult.should_respond === false) {
      console.log('[AI] Agent indicated no response needed:', aiResult.error || aiResult.message);
      return;
    }

    // Send AI response via WhatsApp
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
          message: aiResult.response
        })
      });

      if (!sendResponse.ok) {
        const sendError = await sendResponse.text();
        console.error('[AI] Failed to send message:', sendError);
      } else {
        console.log('[AI] Message sent successfully');
      }

      // Update conversation label if stage changed
      if (aiResult.label_id && aiResult.label_id !== currentStageId) {
        console.log('[AI] Updating label to:', aiResult.label_id);
        
        // Update tags in database - remove old stage labels, add new one
        const newTags = tags.filter(t => !allStageLabels.includes(t));
        newTags.push(aiResult.label_id);
        
        const updateData: Record<string, unknown> = { tags: newTags };
        
        // Se for handoff, pausar IA e registrar motivo
        if (aiResult.should_handoff || aiResult.label_id === HANDOFF_LABEL) {
          updateData.ai_paused = true;
          updateData.ai_handoff_reason = aiResult.handoff_reason || 'Lead qualificado para vendedor';
          console.log('[AI] Handoff triggered:', aiResult.handoff_reason);
        }
        
        await supabase
          .from('whatsapp_conversations')
          .update(updateData)
          .eq('id', conversationId);

        // Update label in WhatsApp (UAZAPI)
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
      }

      // Send video if AI suggests (usually STAGE_2 or STAGE_3)
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
            media_type: 'video'
          })
        });

        // Mark video as sent
        await supabase
          .from('whatsapp_conversations')
          .update({ video_sent: true })
          .eq('id', conversationId);
      }

      // Send site if AI suggests (usually STAGE_3 or STAGE_4)
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
            message: `📊 Conheça nossos cases de sucesso: ${aiResult.site_url}`
          })
        });

        // Mark site as sent
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

    // Extract message data from UAZAPI format
    let messageData = null;
    
    // UAZAPI sends message directly in payload.message
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

    // Extract phone, name from UAZAPI chat object
    const chatId = payload.chat?.wa_chatid || messageData.chatid || messageData.key?.remoteJid || '';
    const isGroup = payload.chat?.wa_isGroup === true || messageData.isGroup === true || chatId.includes('@g.us');
    const senderPhone = chatId.replace(/@s\.whatsapp\.net|@c\.us|@lid|@g\.us/g, '');
    const senderName = payload.chat?.wa_name || payload.chat?.name || messageData.senderName || messageData.pushName || '';
    
    // UAZAPI sends fromMe directly as boolean
    const isFromMe = messageData.fromMe === true || messageData.key?.fromMe === true;

    // Extract message content - UAZAPI sends text/content directly
    let messageContent = '';
    let messageType = 'text';
    let mediaUrl = '';

    // UAZAPI direct format
    if (messageData.text) {
      messageContent = messageData.text;
    } else if (messageData.content) {
      messageContent = messageData.content;
    }
    // Baileys/Evolution format fallback
    else if (messageData.message?.conversation) {
      messageContent = messageData.message.conversation;
    } else if (messageData.message?.extendedTextMessage?.text) {
      messageContent = messageData.message.extendedTextMessage.text;
    }
    
    // Handle media types
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

    // UAZAPI sends messageid directly (not nested in key)
    const messageIdWhatsapp = messageData.messageid || messageData.id || messageData.key?.id || '';
    
    console.log('Extracted data:', { senderPhone, senderName, isFromMe, messageContent, messageType, messageIdWhatsapp });

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
    
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tags, unread_count, ai_paused')
      .eq('phone', senderPhone)
      .single();

    const messagePreview = messageContent.substring(0, 100);

    if (existingConv) {
      conversationId = existingConv.id;
      conversationTags = existingConv.tags || [];
      aiPaused = existingConv.ai_paused === true;
      
      const updateData: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
        status: 'active'
      };

      if (!isFromMe) {
        updateData.unread_count = (existingConv.unread_count || 0) + 1;
      }

      if (!isGroup && senderName) {
        updateData.name = senderName;
      }

      await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversationId);
    } else {
      // For new conversations, add to funnel (STAGE_1 = label 16)
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
          unread_count: isFromMe ? 0 : 1,
          status: 'active'
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
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

    // AI Integration - Process in background for incoming messages
    // IA controla apenas leads nos estágios STAGE_1 a STAGE_4 (labels 16, 13, 14, 20)
    const isInAIControlledStage = conversationTags.some(tag => FUNNEL_LABELS.includes(tag));

    // ===============================
    // FILTRO DE BROADCAST - IA só responde leads de nossas listas
    // ===============================
    
    // Buscar todos os telefones que vieram de NOSSOS broadcasts
    const { data: broadcastLists } = await supabase
      .from('broadcast_lists')
      .select('phones');

    const { data: queueItems } = await supabase
      .from('whatsapp_queue')
      .select('phone');

    // Criar Set com todos os telefones de broadcast (normalizados)
    const broadcastPhones = new Set<string>();

    broadcastLists?.forEach(list => {
      (list.phones as string[] || []).forEach((phone: string) => {
        broadcastPhones.add(phone.replace(/\D/g, '')); // Remove não-dígitos
      });
    });

    queueItems?.forEach(item => {
      broadcastPhones.add(item.phone.replace(/\D/g, ''));
    });

    // Verificar se o remetente é um lead de broadcast
    const senderNormalized = senderPhone.replace(/\D/g, '');
    const isFromBroadcast = broadcastPhones.has(senderNormalized);

    console.log('[AI] Broadcast check:', { 
      senderPhone: senderNormalized, 
      isFromBroadcast, 
      totalBroadcastPhones: broadcastPhones.size 
    });

    // IA só responde se: não é minha mensagem, não é grupo, tem conteúdo, 
    // está em estágio controlado, não está pausada E veio de broadcast
    if (!isFromMe && !isGroup && messageContent && isInAIControlledStage && !aiPaused && isFromBroadcast) {
      console.log('[AI] Triggering background AI processing for conversation:', conversationId);
      
      // Process AI in background (fire and forget - doesn't block webhook response)
      processAIResponse(
        supabaseUrl,
        supabaseServiceKey,
        conversationId,
        messageContent,
        senderPhone,
        conversationTags
      ).catch(err => console.error('[AI] Background processing failed:', err));
    } else {
      console.log('[AI] Skipping AI:', { 
        isFromMe, 
        isGroup, 
        hasContent: !!messageContent, 
        isInAIControlledStage, 
        aiPaused,
        isFromBroadcast // Novo campo de debug
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

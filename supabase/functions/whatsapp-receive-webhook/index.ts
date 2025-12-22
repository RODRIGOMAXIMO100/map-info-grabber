import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    console.log('Event type:', payload.event);
    console.log('Has messages:', !!payload.messages);
    console.log('Has data:', !!payload.data);
    console.log('Has chat:', !!payload.chat);

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
      } else if (type === 'audio' || messageData.message?.audioMessage) {
        messageType = 'audio';
        messageContent = '[Áudio]';
      } else if (type === 'video' || messageData.message?.videoMessage) {
        messageType = 'video';
        messageContent = messageContent || '[Vídeo]';
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
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tags, unread_count')
      .eq('phone', senderPhone)
      .single();

    const messagePreview = messageContent.substring(0, 100);

    if (existingConv) {
      conversationId = existingConv.id;
      
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
      const { data: newConv, error: createError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: senderPhone,
          name: isGroup ? 'Grupo' : (senderName || null),
          is_group: isGroup,
          tags: [],
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

    // AI Integration - set ai_pending_at for debounce
    if (!isFromMe && !isGroup && messageContent) {
      const { data: convData } = await supabase
        .from('whatsapp_conversations')
        .select('ai_paused, tags')
        .eq('id', conversationId)
        .single();

      const FUNNEL_LABELS = ['16', '13', '14'];
      const tags = convData?.tags || [];
      const isInFunnel = tags.some((tag: string) => FUNNEL_LABELS.includes(tag));

      if (isInFunnel && !convData?.ai_paused) {
        await supabase
          .from('whatsapp_conversations')
          .update({ ai_pending_at: new Date().toISOString() })
          .eq('id', conversationId);
      }
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

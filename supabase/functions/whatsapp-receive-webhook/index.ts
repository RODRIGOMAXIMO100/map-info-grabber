import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel Stages - IA controla STAGE_1 a STAGE_4
const FUNNEL_LABELS = ['16', '13', '14', '20'];
const HANDOFF_LABEL = '21';
const INITIAL_STAGE = '16'; // Lead Novo

// ============= PHONE NORMALIZATION =============
// Normaliza telefones brasileiros para formato consistente: 55 + DDD + 9 + número
// Isso resolve problemas de matching quando o telefone vem sem o 9 ou sem o 55
function normalizePhone(phone: string): string {
  // Remove tudo que não é número
  let cleaned = phone.replace(/\D/g, '');
  
  // Se não começa com 55, adiciona (telefone brasileiro)
  if (!cleaned.startsWith('55') && cleaned.length >= 10) {
    cleaned = '55' + cleaned;
  }
  
  // Celulares brasileiros modernos têm 13 dígitos: 55 + DDD(2) + 9 + número(8)
  // Se tem 12 dígitos (55 + DDD + 8), provavelmente está faltando o 9
  if (cleaned.startsWith('55') && cleaned.length === 12) {
    const ddd = cleaned.substring(2, 4);
    const number = cleaned.substring(4);
    
    // Se o número tem 8 dígitos e não começa com 9, é um celular antigo
    // DDDs de celular no Brasil: geralmente começam com 6, 7, 8, 9
    const firstDigit = number.charAt(0);
    if (number.length === 8 && ['6', '7', '8'].includes(firstDigit)) {
      cleaned = '55' + ddd + '9' + number;
      console.log(`[Phone Normalize] Added 9 digit: ${phone} → ${cleaned}`);
    }
  }
  
  return cleaned;
}

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
          
          // Build complete handoff reason with conversation summary
          let handoffInfo = `⚠️ ${aiResult.handoff_reason || 'Lead qualificado para vendedor'}`;
          if (aiResult.conversation_summary) {
            handoffInfo += `\n\n${aiResult.conversation_summary}`;
          }
          updateData.ai_handoff_reason = handoffInfo;
          
          console.log('[AI] Handoff triggered:', aiResult.handoff_reason);
          console.log('[AI] Conversation summary:', aiResult.conversation_summary);
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

// Check if phone received a broadcast message recently (fallback CRM detection)
async function checkIfBroadcastLead(
  supabase: any,
  phone: string
): Promise<{ isBroadcastLead: boolean; dnaId: string | null; configId: string | null }> {
  try {
    // Use the same normalization function for consistent matching
    const normalizedPhone = normalizePhone(phone);
    
    // Extract last 8 digits for flexible matching
    // This handles cases where phone in queue has formatting like "(31) 98336-0707"
    // and incoming phone is normalized like "5531983360707"
    const phoneDigits = normalizedPhone.replace(/\D/g, '').slice(-8);

    // Check whatsapp_queue for recent sent messages to this phone (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log(`[CRM Detection] Searching for phone digits: ${phoneDigits} (from ${phone})`);

    const { data: queueItems } = await supabase
      .from('whatsapp_queue')
      .select('id, config_id, broadcast_list_id, phone')
      .eq('status', 'sent')
      .gte('processed_at', thirtyDaysAgo.toISOString())
      .ilike('phone', `%${phoneDigits}%`)
      .limit(1);

    if (queueItems && queueItems.length > 0) {
      const queueItem = queueItems[0] as { id: string; config_id: string | null; broadcast_list_id: string | null };
      let dnaId: string | null = null;

      // Get DNA from broadcast list if exists
      if (queueItem.broadcast_list_id) {
        const { data: broadcastList } = await supabase
          .from('broadcast_lists')
          .select('dna_id')
          .eq('id', queueItem.broadcast_list_id)
          .maybeSingle();
        dnaId = (broadcastList as { dna_id: string | null } | null)?.dna_id || null;
      }

      console.log(`[CRM Detection] Found broadcast history for phone ${phone}, marking as CRM lead`);
      return { isBroadcastLead: true, dnaId, configId: queueItem.config_id };
    }

    return { isBroadcastLead: false, dnaId: null, configId: null };
  } catch (error) {
    console.error('[CRM Detection] Error checking broadcast history:', error);
    return { isBroadcastLead: false, dnaId: null, configId: null };
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
      const normalizedInstancePhone = instancePhone.replace(/\D/g, '');
      
      const { data: configByPhone } = await supabase
        .from('whatsapp_config')
        .select('id, instance_phone')
        .eq('is_active', true);
      
      if (configByPhone && configByPhone.length > 0) {
        const matchedConfig = configByPhone.find(config => {
          if (!config.instance_phone) return false;
          const normalizedConfigPhone = config.instance_phone.replace(/\D/g, '');
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
    let rawPhone = chatId.replace(/@s\.whatsapp\.net|@c\.us|@lid|@g\.us/g, '');
    
    // Normalize phone using the new function that handles missing 9 digit
    const senderPhone = normalizePhone(rawPhone);
    console.log(`[Phone] Raw: ${rawPhone} → Normalized: ${senderPhone}`);
    
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
    let isCrmLead = false;
    
    // Use last 8 digits for flexible matching to handle different phone formats
    // e.g., 553183360707 should match 5531983360707 (same physical number)
    const phoneDigits = senderPhone.replace(/\D/g, '').slice(-8);
    console.log(`[Conversation Search] Looking for phone ending in: ${phoneDigits}`);

    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tags, unread_count, ai_paused, config_id, is_crm_lead, dna_id, phone')
      .ilike('phone', `%${phoneDigits}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Log the match result
    if (existingConv) {
      console.log(`[Conversation Search] Found existing conversation: ${existingConv.id} (phone: ${existingConv.phone})`);
      if (existingConv.phone !== senderPhone) {
        console.log(`[Phone Format] Incoming: ${senderPhone} vs Stored: ${existingConv.phone} - Same physical number, different format`);
      }
    } else {
      console.log(`[Conversation Search] No existing conversation found for ${senderPhone}`);
    }

    // Correção do bug: garantir que messageContent é string antes de substring
    const messagePreview = typeof messageContent === 'string' 
      ? messageContent.substring(0, 100) 
      : '[Mídia]';

    if (existingConv) {
      conversationId = existingConv.id;
      conversationTags = existingConv.tags || [];
      aiPaused = existingConv.ai_paused === true;
      existingConfigId = existingConv.config_id;
      isCrmLead = existingConv.is_crm_lead === true;
      
      // ===== FALLBACK: Auto-detect CRM lead if not already marked =====
      // Se is_crm_lead é false mas a pessoa recebeu um broadcast, marca como CRM lead
      if (!isCrmLead && !isFromMe) {
        const broadcastCheck = await checkIfBroadcastLead(supabase, senderPhone);
        
        if (broadcastCheck.isBroadcastLead) {
          console.log(`[CRM Fallback] Marking ${senderPhone} as CRM lead (found in broadcast history)`);
          isCrmLead = true;
          
          // Se não tem tags de funil, coloca no estágio inicial
          const hasAnyFunnelTag = conversationTags.some(tag => 
            ['16', '13', '14', '20', '21', '22', '23'].includes(tag)
          );
          
          if (!hasAnyFunnelTag) {
            conversationTags = [INITIAL_STAGE]; // Lead Novo
          }
          
          // Update conversation with CRM lead status
          const updateCrmData: Record<string, unknown> = {
            is_crm_lead: true,
            tags: conversationTags
          };
          
          // Set DNA if not already set
          if (!existingConv.dna_id && broadcastCheck.dnaId) {
            updateCrmData.dna_id = broadcastCheck.dnaId;
          }
          
          // Set config_id if not already set
          if (!existingConfigId && broadcastCheck.configId) {
            updateCrmData.config_id = broadcastCheck.configId;
            existingConfigId = broadcastCheck.configId;
          }
          
          await supabase
            .from('whatsapp_conversations')
            .update(updateCrmData)
            .eq('id', conversationId);
          
          console.log(`[CRM Fallback] Updated conversation ${conversationId}:`, updateCrmData);
        }
      }
      
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
      // NOVA CONVERSA: Verifica se é do broadcast antes de criar
      let newConvDnaId: string | null = null;
      let newConvConfigId: string | null = configId;
      
      // Check if this is a broadcast lead responding for the first time
      if (!isFromMe) {
        const broadcastCheck = await checkIfBroadcastLead(supabase, senderPhone);
        if (broadcastCheck.isBroadcastLead) {
          console.log(`[New Conv] Phone ${senderPhone} is a broadcast lead, marking as CRM`);
          isCrmLead = true;
          conversationTags = [INITIAL_STAGE]; // Lead Novo
          newConvDnaId = broadcastCheck.dnaId;
          if (!newConvConfigId && broadcastCheck.configId) {
            newConvConfigId = broadcastCheck.configId;
          }
        }
      }
      
      const { data: newConv, error: createError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: senderPhone,
          name: isGroup ? 'Grupo' : (senderName || null),
          is_group: isGroup,
          tags: conversationTags,
          is_crm_lead: isCrmLead,
          dna_id: newConvDnaId,
          last_message_at: new Date().toISOString(),
          last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
          last_lead_message_at: isFromMe ? null : new Date().toISOString(),
          unread_count: isFromMe ? 0 : 1,
          status: 'active',
          followup_count: 0,
          config_id: newConvConfigId
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
      existingConfigId = newConvConfigId;
      
      console.log(`[New Conv] Created conversation ${conversationId}: is_crm_lead=${isCrmLead}, tags=${conversationTags}`);
    }

    // === AUTO BLACKLIST: Detect opt-out keywords ===
    if (!isFromMe && messageContent) {
      const optOutKeywords = [
        'sair', 'parar', 'cancelar', 'remover', 'não quero',
        'nao quero', 'stop', 'unsubscribe', 'saia', 'me tire',
        'não me mande', 'nao me mande', 'spam', 'pare'
      ];
      
      const lowerContent = messageContent.toLowerCase().trim();
      const matchedKeyword = optOutKeywords.find(keyword => 
        lowerContent === keyword || 
        lowerContent.startsWith(keyword + ' ') ||
        lowerContent.endsWith(' ' + keyword)
      );
      
      if (matchedKeyword) {
        // Check if auto-blacklist is enabled
        const { data: protectionSettings } = await supabase
          .from('whatsapp_protection_settings')
          .select('auto_blacklist_enabled')
          .limit(1)
          .maybeSingle();
        
        if (protectionSettings?.auto_blacklist_enabled !== false) {
          console.log(`[Blacklist] User ${senderPhone} requested opt-out with keyword: "${matchedKeyword}"`);
          
          // Add to blacklist
          await supabase
            .from('whatsapp_blacklist')
            .upsert({
              phone: senderPhone,
              reason: 'opt_out',
              keyword_matched: matchedKeyword,
              added_at: new Date().toISOString()
            }, { onConflict: 'phone' });
          
          // Pause AI for this conversation
          await supabase
            .from('whatsapp_conversations')
            .update({ 
              ai_paused: true,
              ai_handoff_reason: `Usuário solicitou opt-out: "${matchedKeyword}"`
            })
            .eq('id', conversationId);
          
          // Update aiPaused flag for the trigger check below
          aiPaused = true;
        }
      }
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

    // AI Integration - usa is_crm_lead como gate DEFINITIVO
    const isInAIControlledStage = conversationTags.some(tag => FUNNEL_LABELS.includes(tag));
    const hasValidContent = typeof messageContent === 'string' && messageContent.trim().length > 0;

    console.log('[AI] CRM Lead check:', { 
      senderPhone, 
      isCrmLead, 
      isInAIControlledStage,
      aiPaused,
      tags: conversationTags,
      hasValidContent,
      isFromMe,
      isGroup
    });

    // IA SÓ responde se:
    // 1. is_crm_lead = true (veio do broadcast/CRM)
    // 2. Está em estágio controlado pela IA
    // 3. Não está pausado
    // 4. Não é grupo
    // 5. Não é mensagem própria
    // 6. Tem conteúdo válido
    if (!isFromMe && !isGroup && hasValidContent && isInAIControlledStage && !aiPaused && isCrmLead) {
      console.log('[AI] ✅ Triggering AI for CRM lead:', conversationId);
      
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
      console.log('[AI] ❌ Skipping AI:', { 
        isFromMe, 
        isGroup, 
        hasValidContent, 
        isInAIControlledStage, 
        aiPaused,
        isCrmLead,
        reason: !isCrmLead ? 'NOT_CRM_LEAD' : !isInAIControlledStage ? 'NOT_IN_FUNNEL' : aiPaused ? 'AI_PAUSED' : 'OTHER'
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

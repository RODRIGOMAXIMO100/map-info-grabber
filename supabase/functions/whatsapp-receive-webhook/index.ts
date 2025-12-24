import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel Stages - Aceita tanto tags numéricas (legado) quanto strings
const FUNNEL_LABELS_NUMERIC = ['16', '13', '14', '20'];
const FUNNEL_LABELS_STRING = ['new', 'qualification', 'presentation', 'interest', 'negotiating', 'converted', 'lost'];
const ALL_FUNNEL_LABELS = [...FUNNEL_LABELS_NUMERIC, ...FUNNEL_LABELS_STRING];
const HANDOFF_LABEL_NUMERIC = '21';
const HANDOFF_LABEL_STRING = 'handoff';
const ALL_HANDOFF_LABELS = [HANDOFF_LABEL_NUMERIC, HANDOFF_LABEL_STRING];
const INITIAL_STAGE = 'new'; // Lead Novo - usando string como padrão

// Normalize phone for robust comparison - extracts core 8 digits
function normalizePhoneForComparison(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');
  
  // Remove Brazil country code (55) if present
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2);
  }
  
  // Extract last 8 digits (unique part of the number, ignoring DDD and mobile 9)
  return digits.slice(-8);
}

// Check if phone is from a broadcast (replied to a sent message)
async function isFromBroadcast(supabase: any, phone: string): Promise<boolean> {
  const phoneCore = normalizePhoneForComparison(phone);
  
  // Check whatsapp_queue for sent messages to this phone
  const { data: queueItems, error } = await supabase
    .from('whatsapp_queue')
    .select('id, phone')
    .in('status', ['sent', 'delivered', 'processing'])
    .limit(1000);

  if (error) {
    console.error('[Broadcast Check] Error:', error);
    return false;
  }

  // Check if any queue item matches this phone (compare core 8 digits)
  const isMatch = (queueItems || []).some((item: any) => {
    const queuePhoneCore = normalizePhoneForComparison(item.phone || '');
    return queuePhoneCore === phoneCore;
  });

  console.log(`[Broadcast Check] Phone ${phone} core=${phoneCore}: ${isMatch ? 'FOUND in broadcast' : 'NOT from broadcast'}`);
  return isMatch;
}

// AI processing is now handled by the process-ai-responses cron function
// This webhook only sets ai_pending_at to queue the conversation for processing

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
    const senderPhone = chatId.replace(/@s\.whatsapp\.net|@c\.us|@lid|@g\.us/g, '').replace(/\D/g, '');
    
    console.log(`[Phone] Extracted: ${senderPhone}`);
    
    const senderName = payload.chat?.wa_name || payload.chat?.name || messageData.senderName || messageData.pushName || '';
    const senderProfilePic = payload.chat?.imagePreview || payload.chat?.image || '';
    
    const isFromMe = messageData.fromMe === true || messageData.key?.fromMe === true;

    let messageContent = '';
    let messageType = 'text';
    let mediaUrl = '';
    let rawMediaData: Record<string, unknown> | null = null;

    // UAZAPI sends messageType like "ImageMessage", "AudioMessage", etc.
    const uazapiMessageType = messageData.messageType || '';
    console.log('[Media Debug] messageData.messageType:', uazapiMessageType);
    console.log('[Media Debug] typeof messageData.content:', typeof messageData.content);

    const detectUazapiMediaType = (mt: string): string => {
      const t = (mt || '').toLowerCase();
      if (t.includes('image')) return 'image';
      if (t.includes('audio') || t.includes('ptt') || t.includes('voice')) return 'audio';
      if (t.includes('video')) return 'video';
      if (t.includes('document') || t.includes('file')) return 'document';
      if (t.includes('sticker')) return 'sticker';
      return 'text';
    };

    // Check if content is a media object (UAZAPI structure)
    if (typeof messageData.content === 'object' && messageData.content !== null) {
      console.log('[Media Debug] messageData.content is object:', JSON.stringify(messageData.content).substring(0, 500));
      rawMediaData = messageData.content;
      messageType = detectUazapiMediaType(uazapiMessageType);

      // Store the complete media data as JSON
      messageContent = JSON.stringify(rawMediaData);

      // Extract caption if available
      const caption = (rawMediaData as any)?.Caption || (rawMediaData as any)?.caption || '';
      if (caption) {
        console.log('[Media Debug] Found caption:', caption);
      }
    } else {
      // Text-first extraction
      if (messageData.text) {
        messageContent = messageData.text;
      } else if (typeof messageData.content === 'string') {
        messageContent = messageData.content;
      } else if (messageData.message?.conversation) {
        messageContent = messageData.message.conversation;
      } else if (messageData.message?.extendedTextMessage?.text) {
        messageContent = messageData.message.extendedTextMessage.text;
      }

      // IMPORTANT: For media types (audio, image, video, etc.), ALWAYS save the full messageData as JSON
      // This ensures we have mediaKey, directPath, url, mimetype for later decryption/download
      const inferredType = detectUazapiMediaType(uazapiMessageType);
      if (inferredType !== 'text') {
        messageType = inferredType;
        rawMediaData = messageData as Record<string, unknown>;
        
        // Build complete metadata object for audio/media
        const mediaMetadata: Record<string, unknown> = {
          messageType: uazapiMessageType,
          type: inferredType,
          // Include all possible media fields
          MediaKey: messageData.MediaKey || messageData.mediaKey,
          mediaKey: messageData.mediaKey || messageData.MediaKey,
          DirectPath: messageData.DirectPath || messageData.directPath,
          directPath: messageData.directPath || messageData.DirectPath,
          URL: messageData.URL || messageData.url,
          url: messageData.url || messageData.URL,
          Mimetype: messageData.Mimetype || messageData.mimetype,
          mimetype: messageData.mimetype || messageData.Mimetype,
          Seconds: messageData.Seconds || messageData.seconds,
          seconds: messageData.seconds || messageData.Seconds,
          FileLength: messageData.FileLength || messageData.fileLength,
          fileLength: messageData.fileLength || messageData.FileLength,
          FileName: messageData.FileName || messageData.fileName,
          fileName: messageData.fileName || messageData.FileName,
          caption: messageContent || '',
        };
        
        // Also check nested content/message if exists
        if (messageData.content && typeof messageData.content === 'object') {
          Object.assign(mediaMetadata, messageData.content);
        }
        if (messageData.message && typeof messageData.message === 'object') {
          const msgKey = `${inferredType}Message`;
          if (messageData.message[msgKey]) {
            Object.assign(mediaMetadata, messageData.message[msgKey]);
          }
        }
        
        messageContent = JSON.stringify(mediaMetadata);
        console.log('[Media Debug] Media inferred from messageType; saved complete metadata:', messageContent.substring(0, 300));
      }
    }
    // Fallback: check for media in messageData.message structure (alternative webhook format)
    if (messageType === 'text' && messageData.message) {
      if (messageData.message.imageMessage) {
        messageType = 'image';
        rawMediaData = messageData.message.imageMessage;
        messageContent = JSON.stringify(rawMediaData);
      } else if (messageData.message.audioMessage) {
        messageType = 'audio';
        rawMediaData = messageData.message.audioMessage;
        messageContent = JSON.stringify(rawMediaData);
      } else if (messageData.message.videoMessage) {
        messageType = 'video';
        rawMediaData = messageData.message.videoMessage;
        messageContent = JSON.stringify(rawMediaData);
      } else if (messageData.message.documentMessage) {
        messageType = 'document';
        rawMediaData = messageData.message.documentMessage;
        messageContent = JSON.stringify(rawMediaData);
      } else if (messageData.message.stickerMessage) {
        messageType = 'sticker';
        rawMediaData = messageData.message.stickerMessage;
        messageContent = JSON.stringify(rawMediaData);
      }
    }
    
    // Also check mediaType field (another common format)
    if (messageType === 'text' && (messageData.mediaType || messageData.type)) {
      const type = messageData.mediaType || messageData.type;
      if (type === 'image') messageType = 'image';
      else if (type === 'audio' || type === 'ptt') messageType = 'audio';
      else if (type === 'video') messageType = 'video';
      else if (type === 'document') messageType = 'document';
      else if (type === 'sticker') messageType = 'sticker';
      
      if (messageType !== 'text') {
        rawMediaData = messageData;
        messageContent = JSON.stringify(messageData);
      }
    }

    const messageIdWhatsapp = messageData.messageid || messageData.id || messageData.key?.id || '';

    // Try to download and persist media if URL is available
    if (rawMediaData && messageType !== 'text') {
      const mediaKey = (rawMediaData as any).MediaKey || (rawMediaData as any).mediaKey;
      const directPath = (rawMediaData as any).DirectPath || (rawMediaData as any).directPath;
      const tempMediaUrl = (rawMediaData as any).URL || 
                           (rawMediaData as any).url || 
                           (rawMediaData as any).MediaUrl ||
                           (rawMediaData as any).mediaUrl;
      const mimetype = (rawMediaData as any).Mimetype || (rawMediaData as any).mimetype || '';
      
      console.log('[Media Debug] mediaKey:', mediaKey ? 'YES' : 'NO');
      console.log('[Media Debug] directPath:', directPath ? 'YES' : 'NO');
      console.log('[Media Debug] tempMediaUrl:', tempMediaUrl ? 'YES' : 'NO');
      
      // If we have encrypted media (mediaKey + directPath/url), try to decrypt
      if (mediaKey && (directPath || tempMediaUrl)) {
        const encryptedUrl = tempMediaUrl || (directPath ? `https://mmg.whatsapp.net${directPath}` : null);
        
        if (encryptedUrl) {
          console.log('[Media] Attempting encrypted media download/decrypt:', encryptedUrl.substring(0, 80));
          
          try {
            // Call our decrypt function
            const decryptResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-download-media`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                message_id: messageIdWhatsapp,
                encrypted_url: encryptedUrl,
                media_key: mediaKey,
                media_type: messageType,
                mimetype: mimetype,
              })
            });

            if (decryptResponse.ok) {
              const decryptResult = await decryptResponse.json();
              if (decryptResult.media_url) {
                mediaUrl = decryptResult.media_url;
                console.log('[Media] Decrypted and uploaded successfully:', mediaUrl);
                
                // Update content with the permanent URL
                try {
                  const contentObj = JSON.parse(messageContent);
                  contentObj.media_url = mediaUrl;
                  messageContent = JSON.stringify(contentObj);
                } catch {
                  messageContent = JSON.stringify({ ...rawMediaData, media_url: mediaUrl });
                }
              } else {
                console.log('[Media] Decrypt function returned no URL:', decryptResult);
              }
            } else {
              const errorText = await decryptResponse.text();
              console.error('[Media] Decrypt function failed:', decryptResponse.status, errorText);
            }
          } catch (decryptError) {
            console.error('[Media] Error calling decrypt function:', decryptError);
          }
        }
      } 
      // Fallback: try direct download if URL looks accessible (not encrypted)
      else if (tempMediaUrl && !tempMediaUrl.includes('.enc')) {
        try {
          console.log('[Media] Attempting direct download from:', tempMediaUrl);
          
          const mediaResponse = await fetch(tempMediaUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            }
          });
          
          if (mediaResponse.ok) {
            const blob = await mediaResponse.blob();
            const mimeToExt: Record<string, string> = {
              'image/jpeg': 'jpg',
              'image/png': 'png',
              'image/webp': 'webp',
              'image/gif': 'gif',
              'audio/ogg': 'ogg',
              'audio/ogg; codecs=opus': 'ogg',
              'audio/mpeg': 'mp3',
              'audio/mp4': 'm4a',
              'video/mp4': 'mp4',
              'video/webm': 'webm',
              'application/pdf': 'pdf',
            };
            const extension = mimeToExt[mimetype] || 
                            (messageType === 'image' ? 'jpg' 
                            : messageType === 'audio' ? 'ogg' 
                            : messageType === 'video' ? 'mp4' 
                            : messageType === 'document' ? 'pdf'
                            : 'bin');
            
            const fileName = `media/${Date.now()}_${messageIdWhatsapp || crypto.randomUUID()}.${extension}`;
            
            const { error: uploadError } = await supabase.storage
              .from('broadcast-media')
              .upload(fileName, blob, {
                contentType: mimetype || blob.type || `${messageType}/*`,
                upsert: false
              });
            
            if (uploadError) {
              console.error('[Media] Upload error:', uploadError);
            } else {
              const { data: publicUrlData } = supabase.storage
                .from('broadcast-media')
                .getPublicUrl(fileName);
              
              mediaUrl = publicUrlData.publicUrl;
              console.log('[Media] Direct upload successful:', mediaUrl);
              
              try {
                const contentObj = JSON.parse(messageContent);
                contentObj.media_url = mediaUrl;
                messageContent = JSON.stringify(contentObj);
              } catch {
                messageContent = JSON.stringify({ ...rawMediaData, media_url: mediaUrl });
              }
            }
          } else {
            console.log('[Media] Direct download failed:', mediaResponse.status);
          }
        } catch (mediaError) {
          console.error('[Media] Error with direct download:', mediaError);
        }
      } else {
        console.log('[Media Debug] No downloadable URL, keeping JSON content for frontend handling');
      }
    }
    
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
    
    // Simple phone matching - exact match
    const { data: existingConv } = await supabase
      .from('whatsapp_conversations')
      .select('id, tags, unread_count, ai_paused, config_id, phone, avatar_url, name')
      .eq('phone', senderPhone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const messagePreview = typeof messageContent === 'string' 
      ? messageContent.substring(0, 100) 
      : '[Mídia]';

    if (existingConv) {
      conversationId = existingConv.id;
      conversationTags = existingConv.tags || [];
      aiPaused = existingConv.ai_paused === true;
      existingConfigId = existingConv.config_id;
      
      console.log(`[Conversation] Found existing: ${conversationId}, tags: ${conversationTags}, ai_paused: ${aiPaused}`);
      
      const updateData: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
        status: 'active'
      };

      if (!existingConfigId && configId) {
        updateData.config_id = configId;
        existingConfigId = configId;
      }

      if (!isFromMe) {
        updateData.unread_count = (existingConv.unread_count || 0) + 1;
        updateData.last_lead_message_at = new Date().toISOString();
      }

      // Update name - for groups, update if currently generic "Grupo"
      if (isGroup && senderName && existingConv.name === 'Grupo') {
        updateData.name = senderName;
        updateData.group_name = senderName;
      } else if (!isGroup && senderName) {
        updateData.name = senderName;
      }
      
      // Update avatar if available
      if (senderProfilePic && !existingConv.avatar_url) {
        updateData.avatar_url = senderProfilePic;
      }

      await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', conversationId);
    } else {
      // NOVA CONVERSA: Verificar se é do broadcast antes de ativar como lead
      console.log(`[Conversation] Creating new conversation for ${senderPhone}`);
      
      const fromBroadcast = await isFromBroadcast(supabase, senderPhone);
      
      // Só marca como lead se veio do broadcast
      const shouldBeLeadValue = fromBroadcast;
      conversationTags = fromBroadcast ? [INITIAL_STAGE] : []; // Usa 'new' (string) como padrão
      
      console.log(`[Conversation] From broadcast: ${fromBroadcast}, will be lead: ${shouldBeLeadValue}, initial_stage: ${INITIAL_STAGE}`);
      
      const { data: newConv, error: createError } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: senderPhone,
          name: senderName || (isGroup ? 'Grupo' : null),
          group_name: isGroup ? (senderName || null) : null,
          avatar_url: senderProfilePic || null,
          is_group: isGroup,
          tags: conversationTags,
          is_crm_lead: shouldBeLeadValue, // Só é lead se veio do broadcast
          last_message_at: new Date().toISOString(),
          last_message_preview: isFromMe ? `Você: ${messagePreview}` : messagePreview,
          last_lead_message_at: isFromMe ? null : new Date().toISOString(),
          unread_count: isFromMe ? 0 : 1,
          status: 'active',
          followup_count: 0,
          config_id: configId,
          origin: fromBroadcast ? 'broadcast' : 'random'  // Define origin based on broadcast check
        })
        .select()
        .single();

      if (createError) throw createError;
      conversationId = newConv.id;
      existingConfigId = configId;
      
      console.log(`[Conversation] Created: ${conversationId}, is_crm_lead=${shouldBeLeadValue}, origin=${fromBroadcast ? 'broadcast' : 'random'}, tags=${conversationTags}`);
    }

    // === AUTO BLACKLIST: Detect opt-out phrases ===
    // Only check for opt-out if messageContent is a string (not media)
    // Using SPECIFIC PHRASES to avoid false positives like "não quero video"
    if (!isFromMe && messageContent && typeof messageContent === 'string') {
      const optOutPhrases = [
        // Frases específicas de opt-out (completas)
        'não quero mais mensagens',
        'nao quero mais mensagens',
        'não quero receber',
        'nao quero receber',
        'me tire da lista',
        'me remova da lista',
        'sair da lista',
        'parar de receber',
        'pare de me mandar',
        'não me mande mais',
        'nao me mande mais',
        'cancela meu cadastro',
        'remove meu número',
        'remove meu numero',
        // Keywords curtas que são claramente opt-out quando usadas sozinhas
        'stop',
        'unsubscribe',
        'spam'
      ];
      
      const lowerContent = messageContent.toLowerCase().trim();
      
      // Verifica se a mensagem CONTÉM uma frase de opt-out completa
      // OU se a mensagem É EXATAMENTE uma das keywords curtas (stop, unsubscribe, spam)
      const matchedPhrase = optOutPhrases.find(phrase => 
        lowerContent === phrase ||           // mensagem é exatamente a frase
        lowerContent.includes(phrase)        // mensagem contém a frase completa
      );
      
      if (matchedPhrase) {
        const { data: protectionSettings } = await supabase
          .from('whatsapp_protection_settings')
          .select('auto_blacklist_enabled')
          .limit(1)
          .maybeSingle();
        
        if (protectionSettings?.auto_blacklist_enabled !== false) {
          console.log(`[Blacklist] User ${senderPhone} requested opt-out with phrase: "${matchedPhrase}"`);
          
          await supabase
            .from('whatsapp_blacklist')
            .upsert({
              phone: senderPhone,
              reason: 'opt_out',
              keyword_matched: matchedPhrase,
              added_at: new Date().toISOString()
            }, { onConflict: 'phone' });
          
          await supabase
            .from('whatsapp_conversations')
            .update({ 
              ai_paused: true,
              ai_handoff_reason: `Usuário solicitou opt-out: "${matchedPhrase}"`
            })
            .eq('id', conversationId);
          
          aiPaused = true;
        }
      }
    }

    // Check blacklist
    let isBlacklisted = false;
    if (!isFromMe) {
      const { data: blacklistEntry } = await supabase
        .from('whatsapp_blacklist')
        .select('id')
        .eq('phone', senderPhone)
        .maybeSingle();
      
      isBlacklisted = !!blacklistEntry;
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

    // ========== OPTION B: AI RESPONDS ONLY TO LEADS ==========
    // IA responde APENAS se:
    // 1. is_crm_lead = true (veio do broadcast OU ativado manualmente)
    // 2. Não é mensagem própria
    // 3. Não é grupo
    // 4. Não está pausado
    // 5. Não está na blacklist
    // 6. Tem conteúdo válido
    
    const hasValidContent = typeof messageContent === 'string' && messageContent.trim().length > 0;
    
    // Buscar is_crm_lead atualizado
    const { data: convCheck } = await supabase
      .from('whatsapp_conversations')
      .select('is_crm_lead')
      .eq('id', conversationId)
      .single();
    
    const isCrmLead = convCheck?.is_crm_lead === true;

    console.log('[AI] Decision check:', { 
      isFromMe, 
      isGroup, 
      aiPaused, 
      isBlacklisted,
      hasValidContent,
      isCrmLead,
      tags: conversationTags
    });

    // DECISÃO: IA só responde se for lead (broadcast ou manual)
    if (!isFromMe && !isGroup && !aiPaused && !isBlacklisted && hasValidContent && isCrmLead) {
      // Se não tem tag de funil válida, adiciona Lead Novo ('new')
      const hasFunnelTag = conversationTags.some(tag => 
        ALL_FUNNEL_LABELS.includes(tag) || ALL_HANDOFF_LABELS.includes(tag)
      );
      
      if (!hasFunnelTag) {
        console.log(`[AI] Conversa sem tag de funil válida. Adicionando: ${INITIAL_STAGE}`);
        conversationTags = [INITIAL_STAGE];
        await supabase
          .from('whatsapp_conversations')
          .update({ tags: conversationTags, funnel_stage: INITIAL_STAGE })
          .eq('id', conversationId);
      }
      
      console.log('[AI] ✅ Setting ai_pending_at for lead:', conversationId);
      
      // Set ai_pending_at to queue for processing by process-ai-responses cron
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_pending_at: new Date().toISOString(),
          tags: conversationTags 
        })
        .eq('id', conversationId);
    } else {
      let skipReason = 'UNKNOWN';
      if (isFromMe) skipReason = 'IS_OWN_MESSAGE';
      else if (isGroup) skipReason = 'IS_GROUP_CHAT';
      else if (aiPaused) skipReason = 'AI_PAUSED';
      else if (isBlacklisted) skipReason = 'BLACKLISTED';
      else if (!hasValidContent) skipReason = 'NO_VALID_CONTENT';
      else if (!isCrmLead) skipReason = 'NOT_A_LEAD (random person)';

      console.log(`[AI] ⏭️ Skip reason: ${skipReason}`);
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

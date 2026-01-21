import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Robust phone normalization and validation for Brazilian numbers
function normalizeAndValidatePhone(phone: string): { valid: boolean; formatted: string; error?: string } {
  let digits = phone.replace(/\D/g, '');
  
  // WhatsApp groups start with 120 - pass through as-is
  if (digits.startsWith('120')) {
    return { valid: true, formatted: digits };
  }
  
  // Add Brazil country code if number is local (10-11 digits without country code)
  if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  // Brazilian numbers starting with 55: fix missing 9th digit
  // Expected final format: 55 + DDD(2) + 9 + number(8) = 13 digits (mobile)
  // Or: 55 + DDD(2) + number(8) = 12 digits (landline)
  if (digits.startsWith('55')) {
    const ddd = digits.substring(2, 4);
    const numero = digits.substring(4);
    
    // Case 1: 11 digits (55 + DDD + 7 digits) - missing 2 digits, likely incomplete
    // Try to add 9 prefix to make it a valid mobile: 55 + DDD + 9 + 7 digits = 12 digits (still short)
    // This case is truly invalid - number is incomplete
    if (digits.length === 11) {
      // Check if it looks like it should be a mobile (has 9 but missing a digit)
      if (numero.startsWith('9') && numero.length === 7) {
        // Missing one digit at the end - truly invalid
        return { 
          valid: false, 
          formatted: digits,
          error: `Número incompleto: ${digits} (faltando dígitos)`
        };
      }
      // Doesn't start with 9, try adding it
      if (!numero.startsWith('9')) {
        digits = '55' + ddd + '9' + numero;
        console.log(`[Phone] Auto-added 9 prefix (11->12 digits): ${phone} -> ${digits}`);
      }
    }
    
    // Case 2: 12 digits (55 + DDD + 8 digits) - add 9th digit if missing
    if (digits.length === 12 && digits.startsWith('55')) {
      const currentNumero = digits.substring(4);
      if (!currentNumero.startsWith('9')) {
        digits = '55' + ddd + '9' + currentNumero;
        console.log(`[Phone] Auto-added 9th digit (12->13 digits): ${phone} -> ${digits}`);
      }
    }
  }
  
  // Validate final length for Brazilian numbers
  if (digits.startsWith('55') && (digits.length < 12 || digits.length > 13)) {
    return { 
      valid: false, 
      formatted: digits,
      error: `Número brasileiro inválido: ${digits} (${digits.length} dígitos, esperado 12-13)`
    };
  }
  
  // For non-Brazilian numbers, just ensure minimum reasonable length
  if (!digits.startsWith('55') && !digits.startsWith('120') && digits.length < 10) {
    return {
      valid: false,
      formatted: digits,
      error: `Número muito curto: ${digits} (${digits.length} dígitos)`
    };
  }
  
  return { valid: true, formatted: digits };
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversation_id, phone, message, media_url, media_type, config_id } = await req.json();

    if (!message && !media_url) {
      return new Response(
        JSON.stringify({ error: 'Message or media required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine which config to use
    let configToUse = null;
    let conversationId = conversation_id;
    let targetPhone = phone;

    // Priority: 1. Explicit config_id, 2. Conversation's config_id, 3. First active config
    if (config_id) {
      const { data: explicitConfig } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('id', config_id)
        .eq('is_active', true)
        .maybeSingle();
      
      if (explicitConfig) {
        configToUse = explicitConfig;
        console.log('[Send] Using explicit config:', config_id);
      }
    }

    // If we have conversation_id, get phone and possibly config from it
    if (conversation_id) {
      const { data: conversation } = await supabase
        .from('whatsapp_conversations')
        .select('phone, config_id')
        .eq('id', conversation_id)
        .single();
      
      if (conversation) {
        if (!targetPhone) targetPhone = conversation.phone;
        
        // Use conversation's config if we don't have one yet
        if (!configToUse && conversation.config_id) {
          const { data: convConfig } = await supabase
            .from('whatsapp_config')
            .select('*')
            .eq('id', conversation.config_id)
            .eq('is_active', true)
            .maybeSingle();
          
          if (convConfig) {
            configToUse = convConfig;
            console.log('[Send] Using conversation config:', conversation.config_id);
          }
        }
      }
    }

    // Fallback to first active config
    if (!configToUse) {
      const { data: fallbackConfig, error: configError } = await supabase
        .from('whatsapp_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (configError || !fallbackConfig) {
        return new Response(
          JSON.stringify({ error: 'WhatsApp not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      configToUse = fallbackConfig;
      console.log('[Send] Using fallback config:', fallbackConfig.id);
    }

    // Normalize and validate phone number
    const phoneResult = normalizeAndValidatePhone(targetPhone);
    if (!phoneResult.valid) {
      console.error(`[Send] Invalid phone format: ${targetPhone} -> ${phoneResult.formatted} (${phoneResult.error})`);
      return new Response(
        JSON.stringify({ 
          error: phoneResult.error,
          invalid_format: true,
          original_phone: targetPhone
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const formattedPhone = phoneResult.formatted;

    // Send via UAZAPI
    const serverUrl = configToUse.server_url.replace(/\/$/, '');
    let sendEndpoint: string;
    let payload: Record<string, unknown>;

    if (media_url && media_type) {
      sendEndpoint = `${serverUrl}/send/media`;
      payload = { number: formattedPhone, type: media_type, file: media_url, text: message || '' };
    } else {
      sendEndpoint = `${serverUrl}/send/text`;
      payload = { number: formattedPhone, text: message };
    }

    console.log('[Send] Sending message via instance:', configToUse.name || configToUse.id);
    console.log('[Send] Endpoint:', sendEndpoint, 'Payload:', payload);

    const response = await fetch(sendEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': configToUse.instance_token,
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('[Send] UAZAPI response:', result);
    
    // Detectar especificamente erro de WhatsApp desconectado
    if (result.error && result.message === 'WhatsApp disconnected') {
      console.error(`[Send] Instance ${configToUse.name || configToUse.id} is disconnected`);
      return new Response(
        JSON.stringify({ 
          error: `Instância "${configToUse.name || 'WhatsApp'}" está desconectada. Reconecte no painel UAZAPI.`,
          instance_name: configToUse.name,
          instance_id: configToUse.id,
          disconnected: true
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Detectar número inválido ou que não está no WhatsApp
    if (result.error && typeof result.error === 'string' && result.error.includes('not on WhatsApp')) {
      console.error(`[Send] Number not on WhatsApp: ${formattedPhone}`);
      
      // Marcar conversa como número inválido no banco
      if (conversationId) {
        await supabase
          .from('whatsapp_conversations')
          .update({ phone_invalid: true })
          .eq('id', conversationId);
        console.log(`[Send] Marked conversation ${conversationId} as phone_invalid`);
      }
      
      return new Response(
        JSON.stringify({ 
          error: `O número ${formattedPhone} não está no WhatsApp.`,
          invalid_number: true,
          conversation_id: conversationId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Detectar outros erros da API
    if (result.error) {
      console.error(`[Send] UAZAPI error:`, result.error);
      return new Response(
        JSON.stringify({ 
          error: typeof result.error === 'string' ? result.error : 'Erro ao enviar mensagem'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!response.ok) throw new Error(result.message || 'Failed to send message');

    // Find or create conversation
    if (!conversationId) {
      const { data: existingConv } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('phone', formattedPhone)
        .maybeSingle();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        const { data: newConv } = await supabase
          .from('whatsapp_conversations')
          .insert({
            phone: formattedPhone,
            status: 'active',
            last_message_at: new Date().toISOString(),
            last_message_preview: message?.substring(0, 100),
            config_id: configToUse.id // Link to instance
          })
          .select()
          .single();
        conversationId = newConv?.id;
      }
    }

    // Update conversation (reactivate if archived, unless it's the keep-archived instance)
    if (conversationId) {
      // Buscar status atual da conversa para verificar se deve manter arquivado
      const { data: convData } = await supabase
        .from('whatsapp_conversations')
        .select('status, config_id')
        .eq('id', conversationId)
        .single();
      
      const isCurrentlyArchived = convData?.status === 'archived';
      
      const updateFields: Record<string, unknown> = {
        last_message_at: new Date().toISOString(),
        last_message_preview: `Você: ${message?.substring(0, 100) || `[${media_type}]`}`,
      };
      
      // Manter conversas arquivadas (leads perdidos, etc.) - não reativar automaticamente
      if (!isCurrentlyArchived) {
        updateFields.status = 'active';
      } else {
        console.log(`[Send] Mantendo conversa arquivada: ${conversationId}`);
      }
      
      await supabase
        .from('whatsapp_conversations')
        .update(updateFields)
        .eq('id', conversationId);

      // Save message
      await supabase
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversationId,
          direction: 'outgoing',
          message_type: media_type || 'text',
          content: message || null,
          media_url: media_url || null,
          message_id_whatsapp: result.key?.id || result.id || null,
          status: 'sent'
        });
    }

    return new Response(
      JSON.stringify({ success: true, message_id: result.key?.id || result.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Send] Error sending message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

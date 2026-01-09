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

    // Format phone (add 55 for Brazilian numbers)
    let formattedPhone = targetPhone.replace(/\D/g, '');
    if (formattedPhone.length >= 10 && formattedPhone.length <= 11 && !formattedPhone.startsWith('55')) {
      formattedPhone = '55' + formattedPhone;
    }

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

    // Update conversation
    if (conversationId) {
      await supabase
        .from('whatsapp_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: `Você: ${message?.substring(0, 100) || `[${media_type}]`}`
        })
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

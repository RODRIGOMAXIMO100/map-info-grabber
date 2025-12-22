import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CRM Funnel Stages
const CRM_STAGES = {
  STAGE_1: { id: '16', order: 1 },   // Lead frio
  STAGE_2: { id: '13', order: 2 },   // Demonstrou interesse
  STAGE_3: { id: '14', order: 3 },   // Quer comprar
} as const;

type CRMStage = keyof typeof CRM_STAGES;

function getStageFromLabelId(labelId: string): CRMStage | null {
  for (const [stage, info] of Object.entries(CRM_STAGES)) {
    if (info.id === labelId) return stage as CRMStage;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversation_id, incoming_message, conversation_history, current_stage_id } = await req.json();

    if (!conversation_id || !incoming_message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and incoming_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI config
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_config')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!aiConfig?.is_active) {
      return new Response(
        JSON.stringify({ error: 'AI agent is not active', active: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentStage = current_stage_id ? getStageFromLabelId(current_stage_id) : null;
    const currentOrder = currentStage ? CRM_STAGES[currentStage].order : 0;

    // Build conversation history
    const historyMessages = (conversation_history || []).map((msg: { direction: string; content: string }) => ({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: msg.content || ''
    }));
    historyMessages.push({ role: 'user', content: incoming_message });

    // Build prompt
    const systemPrompt = aiConfig.system_prompt || 'Você é um assistente de vendas amigável.';
    
    const fullPrompt = `
${systemPrompt}

RESPONDA EM JSON COM ESTE FORMATO EXATO:
{
  "response": "sua resposta aqui (max 100 chars)",
  "stage": "STAGE_1" ou "STAGE_2" ou "STAGE_3",
  "should_send_video": true/false,
  "should_send_site": true/false
}

REGRAS:
- STAGE_1: Lead frio, ainda não demonstrou interesse real
- STAGE_2: Demonstrou interesse, fez perguntas sobre produto/serviço
- STAGE_3: Quer comprar, pediu preço, forma de pagamento, como fechar

Histórico da conversa:
${historyMessages.slice(0, -1).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'Você'}: ${m.content}`).join('\n')}

Última mensagem do lead: "${incoming_message}"
`;

    console.log('[AI] Calling OpenAI with prompt length:', fullPrompt.length);

    // Call OpenAI
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: fullPrompt },
          ...historyMessages
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 200
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI] OpenAI error:', aiResponse.status, errorText);
      throw new Error(`OpenAI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[AI] OpenAI response:', aiContent);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiContent);
    } catch {
      console.log('[AI] Failed to parse response, using default');
      parsedResponse = {
        response: 'Olá! Como posso ajudar? 😊',
        stage: currentStage || 'STAGE_1',
        should_send_video: false,
        should_send_site: false
      };
    }

    // Prevent stage regression
    const detectedOrder = CRM_STAGES[parsedResponse.stage as CRMStage]?.order || 0;
    if (currentOrder > detectedOrder && currentStage) {
      parsedResponse.stage = currentStage;
    }

    const labelId = CRM_STAGES[parsedResponse.stage as CRMStage]?.id || '16';
    const shouldSendVideo = parsedResponse.should_send_video && !!aiConfig.video_url;
    const shouldSendSite = parsedResponse.should_send_site && !!aiConfig.site_url;

    // Log AI decision
    await supabase
      .from('whatsapp_ai_logs')
      .insert({
        conversation_id,
        incoming_message,
        ai_response: parsedResponse.response,
        detected_intent: parsedResponse.stage,
        applied_label_id: labelId,
        confidence_score: 0.9,
        needs_human: parsedResponse.stage === 'STAGE_3'
      });

    return new Response(
      JSON.stringify({
        response: parsedResponse.response,
        stage: parsedResponse.stage,
        label_id: labelId,
        should_send_video: shouldSendVideo,
        should_send_site: shouldSendSite,
        needs_human: parsedResponse.stage === 'STAGE_3',
        video_url: shouldSendVideo ? aiConfig.video_url : null,
        site_url: shouldSendSite ? aiConfig.site_url : null,
        delay_seconds: aiConfig.auto_reply_delay_seconds || 5
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[AI] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

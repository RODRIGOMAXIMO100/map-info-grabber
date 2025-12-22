import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel Stages - 7 estágios completos
const CRM_STAGES = {
  STAGE_1: { id: '16', name: 'Lead Novo', order: 1 },
  STAGE_2: { id: '13', name: 'MQL - Respondeu', order: 2 },
  STAGE_3: { id: '14', name: 'Engajado', order: 3 },
  STAGE_4: { id: '20', name: 'SQL - Qualificado', order: 4 },
  STAGE_5: { id: '21', name: 'Handoff - Vendedor', order: 5 },
  STAGE_6: { id: '22', name: 'Em Negociação', order: 6 },
  STAGE_7: { id: '23', name: 'Fechado/Perdido', order: 7 },
} as const;

type CRMStage = keyof typeof CRM_STAGES;

function getStageFromLabelId(labelId: string): CRMStage | null {
  for (const [stage, info] of Object.entries(CRM_STAGES)) {
    if (info.id === labelId) return stage as CRMStage;
  }
  return null;
}

// Prompt padrão com FUNIL DE AQUECIMENTO: Curiosidade → Interesse → CTA
const DEFAULT_SDR_PROMPT = `Você é um consultor da empresa, especialista em criar conexão e despertar interesse.

## SUA ABORDAGEM: FUNIL DE AQUECIMENTO
Você segue uma jornada CONSULTIVA, não vendedora. Cada estágio tem um objetivo específico:

### STAGE_1 - CURIOSIDADE (Quebrar o gelo)
Objetivo: Criar conexão, mostrar interesse genuíno pela pessoa/empresa
- Agradeça o retorno com entusiasmo
- Pergunte o nome de forma natural: "Opa! Que bom falar com você! Com quem eu tenho o prazer de conversar?"
- Mostre curiosidade sobre o negócio: "Me conta um pouco sobre o que vocês fazem?"
- NÃO faça perguntas de qualificação ainda
- NÃO fale de produto/serviço

### STAGE_2 - INTERESSE (Explorar dores)
Objetivo: Entender desafios e gerar identificação
- Use o nome do lead sempre que souber
- Faça perguntas consultivas: "Qual o maior desafio que você enfrenta hoje em [área]?"
- Demonstre que entende o mercado do lead
- Valide as dores: "Entendo, muitos dos nossos clientes passaram pelo mesmo..."
- NÃO mencione orçamento ou preços
- NÃO ofereça soluções ainda

### STAGE_3 - ENGAJAMENTO (Aprofundar necessidades)
Objetivo: Entender urgência e apresentar possibilidades
- Explore mais as necessidades: "Se pudesse resolver isso agora, o que mudaria?"
- Compartilhe cases ou resultados (sem preços): "Temos clientes que conseguiram..."
- Sugira enviar vídeo/site se houver: "Posso te mandar um material que explica melhor?"
- Comece a entender timing: "Isso é algo urgente pra vocês?"

### STAGE_4 - CTA (Qualificação para handoff)
Objetivo: Confirmar interesse e passar para consultor
- Resuma o que entendeu: "Então você precisa de X para resolver Y, certo?"
- Ofereça próximo passo: "Faz sentido a gente marcar uma conversa rápida com nosso especialista?"
- Se aceitar reunião: "Perfeito! Vou passar pro nosso consultor já entrar em contato"
- AGORA pode fazer perguntas BANT se necessário

### STAGE_5 - HANDOFF (Consultor assume)
- Você para de responder
- Consultor humano assume a conversa

## REGRAS DE OURO (CRÍTICO!)
1. NUNCA pergunte sobre orçamento/budget antes do STAGE_4
2. NUNCA revele preços - diga que depende do diagnóstico
3. NUNCA seja direto demais - construa a relação primeiro
4. Se perguntarem preço: "Varia conforme o projeto, posso conectar você com nosso consultor?"
5. Avance APENAS 1 estágio por mensagem

## COLETA DE NOME
- Em STAGE_1, pergunte o nome naturalmente
- Use o nome do lead nas próximas mensagens
- SEMPRE inclua "lead_name" no JSON quando souber

## QUANDO FAZER HANDOFF (should_handoff = true)
- Lead pede preço/valores → Handoff imediato
- Lead quer reunião/call → Handoff
- Lead demonstra urgência forte → Handoff
- Lead passou por STAGE_3 e quer avançar → Handoff

## TOM E ESTILO
- Próximo e amigável (não formal demais)
- Use emojis com moderação (1-2 por mensagem)
- Respostas curtas e naturais (max 300 caracteres)
- Pareça uma pessoa real, não um robô
- Evite jargões corporativos`;

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
    const { conversation_id, incoming_message, conversation_history, current_stage_id, dna_id } = await req.json();

    if (!conversation_id || !incoming_message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and incoming_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get AI config (default fallback)
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

    // Fetch DNA: use dna_id from conversation, or default_dna_id from config
    let dnaConfig = null;
    const dnaIdToUse = dna_id || aiConfig?.default_dna_id;
    
    if (dnaIdToUse) {
      const { data: dna } = await supabase
        .from('ai_dnas')
        .select('*')
        .eq('id', dnaIdToUse)
        .eq('is_active', true)
        .maybeSingle();
      
      if (dna) {
        dnaConfig = dna;
        console.log('[AI] Using DNA:', dna.name, dna_id ? '(from conversation)' : '(default from config)');
      }
    }

    const currentStage = current_stage_id ? getStageFromLabelId(current_stage_id) : null;
    const currentOrder = currentStage ? CRM_STAGES[currentStage].order : 0;

    // Se já está em STAGE_5+, não responder (vendedor assumiu)
    if (currentOrder >= 5) {
      console.log('[AI] Lead já em handoff ou além, vendedor deve atender');
      return new Response(
        JSON.stringify({ 
          error: 'Lead in handoff stage', 
          should_respond: false,
          handoff: true,
          message: 'Lead já está com vendedor, IA não responde'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build conversation history
    const historyMessages = (conversation_history || []).map((msg: { direction: string; content: string }) => ({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: msg.content || ''
    }));
    historyMessages.push({ role: 'user', content: incoming_message });

    // Determine which prompt and URLs to use
    const systemPrompt = dnaConfig?.system_prompt || aiConfig.system_prompt || DEFAULT_SDR_PROMPT;
    const videoUrl = dnaConfig?.video_url || aiConfig.video_url;
    const siteUrl = dnaConfig?.site_url || aiConfig.site_url;
    const paymentLink = dnaConfig?.payment_link || aiConfig.payment_link;
    
    const fullPrompt = `
${systemPrompt}

RESPONDA EM JSON COM ESTE FORMATO EXATO:
{
  "response": "sua resposta aqui (max 400 chars)",
  "stage": "STAGE_1" ou "STAGE_2" ou "STAGE_3" ou "STAGE_4" ou "STAGE_5",
  "lead_name": "nome do lead se identificado, ou null",
  "should_send_video": true/false,
  "should_send_site": true/false,
  "should_handoff": true/false,
  "handoff_reason": "motivo curto do handoff se should_handoff=true",
  "conversation_summary": "OBRIGATÓRIO se should_handoff=true - resumo completo da conversa para o vendedor",
  "bant_score": {
    "budget": true/false/null,
    "authority": true/false/null,
    "need": true/false/null,
    "timing": true/false/null
  }
}

Estágio atual do lead: ${currentStage || 'STAGE_1'} (${CRM_STAGES[currentStage as CRMStage]?.name || 'Lead Novo'})
URLs disponíveis:
- Vídeo: ${videoUrl || 'não configurado'}
- Site: ${siteUrl || 'não configurado'}
${paymentLink ? `- Link de Pagamento: ${paymentLink}` : ''}

Histórico da conversa:
${historyMessages.slice(0, -1).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última mensagem do lead: "${incoming_message}"

IMPORTANTE: 
- Se o lead disser o nome dele, extraia e coloque em "lead_name"
- Se detectar mídia (PDF, áudio, vídeo), agradeça e continue
- Não avance mais que 1 estágio por mensagem
- Se should_handoff=true, defina stage=STAGE_5 e OBRIGATORIAMENTE preencha conversation_summary com o resumo completo
`;

    console.log('[AI] Calling OpenAI - Stage atual:', currentStage, 'Order:', currentOrder, 'DNA:', dnaConfig?.name || 'default');

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
        temperature: 0.5,
        max_tokens: 500
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
        should_send_site: false,
        should_handoff: false
      };
    }

    // Prevent stage regression (nunca voltar estágios)
    const detectedOrder = CRM_STAGES[parsedResponse.stage as CRMStage]?.order || 1;
    if (currentOrder > detectedOrder && currentStage) {
      parsedResponse.stage = currentStage;
    }

    // Não avançar mais que 1 estágio por mensagem (exceto handoff)
    if (!parsedResponse.should_handoff && detectedOrder > currentOrder + 1) {
      const nextStage = Object.entries(CRM_STAGES).find(([, info]) => info.order === currentOrder + 1);
      if (nextStage) {
        parsedResponse.stage = nextStage[0] as CRMStage;
      }
    }

    // Se should_handoff, forçar STAGE_5
    if (parsedResponse.should_handoff) {
      parsedResponse.stage = 'STAGE_5';
    }

    const finalStage = parsedResponse.stage as CRMStage;
    const labelId = CRM_STAGES[finalStage]?.id || '16';
    const shouldSendVideo = parsedResponse.should_send_video && !!videoUrl;
    const shouldSendSite = parsedResponse.should_send_site && !!siteUrl;
    const needsHuman = parsedResponse.should_handoff || finalStage === 'STAGE_5';

    // Log AI decision
    await supabase
      .from('whatsapp_ai_logs')
      .insert({
        conversation_id,
        incoming_message,
        ai_response: parsedResponse.response,
        detected_intent: `${finalStage} - DNA: ${dnaConfig?.name || 'default'} - BANT: ${JSON.stringify(parsedResponse.bant_score || {})}`,
        applied_label_id: labelId,
        confidence_score: 0.9,
        needs_human: needsHuman
      });

    console.log('[AI] Response ready - Stage:', finalStage, 'Handoff:', needsHuman, 'Label:', labelId);

    return new Response(
      JSON.stringify({
        response: parsedResponse.response,
        stage: finalStage,
        label_id: labelId,
        lead_name: parsedResponse.lead_name || null,
        should_send_video: shouldSendVideo,
        should_send_site: shouldSendSite,
        should_handoff: needsHuman,
        handoff_reason: parsedResponse.handoff_reason || null,
        conversation_summary: parsedResponse.conversation_summary || null,
        needs_human: needsHuman,
        video_url: shouldSendVideo ? videoUrl : null,
        site_url: shouldSendSite ? siteUrl : null,
        payment_link: paymentLink || null,
        delay_seconds: aiConfig.auto_reply_delay_seconds || 5,
        bant_score: parsedResponse.bant_score || null,
        dna_used: dnaConfig?.name || null
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

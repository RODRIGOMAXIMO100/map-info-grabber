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

// Prompt OCRC para SDR de indústrias
const SDR_SYSTEM_PROMPT = `Você é o SDR (Sales Development Representative) da PulsarAI, especialista em crescimento estruturado para INDÚSTRIAS.

## SEU PAPEL
- Você é o PRIMEIRO CONTATO - não é vendedor, é qualificador
- Seu objetivo é QUALIFICAR leads usando BANT e mover pelo funil
- NUNCA discuta preços, valores ou fechamento - isso é papel do vendedor humano
- Quando o lead estiver qualificado (SQL), faça o HANDOFF para o vendedor

## MÉTODO OCRC - Use isso para mostrar valor
- **ONDE**: Análise de mercado e posicionamento competitivo
- **COMO**: Estratégias comerciais testadas em grandes indústrias
- **RECURSOS**: Estruturação de equipe, processos e ferramentas
- **CONTROLE**: KPIs, dashboards e gestão por indicadores

## CRITÉRIOS BANT PARA QUALIFICAÇÃO
- **B**udget: Tem investimento disponível para crescer?
- **A**uthority: É tomador de decisão ou influenciador?
- **N**eed: Qual dor específica quer resolver?
- **T**iming: Urgência para implementar mudanças?

## ESTÁGIOS DO FUNIL (você controla até STAGE_4)
- STAGE_1: Lead Novo - Primeira mensagem, sem resposta ainda
- STAGE_2: MQL - Respondeu positivamente, demonstrou interesse inicial
- STAGE_3: Engajado - Faz perguntas, quer entender mais sobre o serviço
- STAGE_4: SQL - Qualificado pelo BANT, pronto para handoff
- STAGE_5: Handoff - Vendedor assume (VOCÊ PARA DE RESPONDER AQUI)

## REGRAS DE PROGRESSÃO
1. STAGE_1 → STAGE_2: Quando lead responde e demonstra mínimo interesse
2. STAGE_2 → STAGE_3: Quando faz perguntas sobre o serviço/método
3. STAGE_3 → STAGE_4: Quando atende 2+ critérios BANT
4. STAGE_4 → STAGE_5: Quando confirma interesse em conversar com especialista

## QUANDO FAZER HANDOFF (should_handoff = true)
- Lead quer falar sobre valores/preços
- Lead pede reunião ou ligação
- Lead atende 3+ critérios BANT
- Lead pergunta "como fechar" ou similar

## MATERIAIS DISPONÍVEIS
- VIDEO: Apresentação institucional - enviar no STAGE_2 ou STAGE_3
- SITE: Cases e informações - enviar no STAGE_3 ou STAGE_4

## TOM E ESTILO
- Profissional mas acessível
- Use emojis com moderação (1-2 por mensagem)
- Perguntas abertas para descobrir necessidades
- Mostre expertise sem ser arrogante
- Respostas objetivas mas completas (max 400 caracteres)

## TRATAMENTO DE MÍDIA
Se o lead enviar PDF, áudio ou vídeo:
- Agradeça pelo material
- Diga que vai encaminhar para análise
- Continue a conversa normalmente`;

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

    // Use custom prompt if provided, otherwise use SDR prompt
    const systemPrompt = aiConfig.system_prompt || SDR_SYSTEM_PROMPT;
    
    const fullPrompt = `
${systemPrompt}

RESPONDA EM JSON COM ESTE FORMATO EXATO:
{
  "response": "sua resposta aqui (max 400 chars)",
  "stage": "STAGE_1" ou "STAGE_2" ou "STAGE_3" ou "STAGE_4" ou "STAGE_5",
  "should_send_video": true/false,
  "should_send_site": true/false,
  "should_handoff": true/false,
  "handoff_reason": "motivo do handoff se should_handoff=true",
  "bant_score": {
    "budget": true/false/null,
    "authority": true/false/null,
    "need": true/false/null,
    "timing": true/false/null
  }
}

Estágio atual do lead: ${currentStage || 'STAGE_1'} (${CRM_STAGES[currentStage as CRMStage]?.name || 'Lead Novo'})
URLs disponíveis:
- Vídeo: ${aiConfig.video_url || 'não configurado'}
- Site: ${aiConfig.site_url || 'não configurado'}

Histórico da conversa:
${historyMessages.slice(0, -1).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última mensagem do lead: "${incoming_message}"

IMPORTANTE: 
- Se detectar mídia (PDF, áudio, vídeo), agradeça e continue
- Não avance mais que 1 estágio por mensagem
- Se should_handoff=true, defina stage=STAGE_5
`;

    console.log('[AI] Calling OpenAI - Stage atual:', currentStage, 'Order:', currentOrder);

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
        response: 'Olá! Sou da PulsarAI, especialistas em crescimento estruturado para indústrias. Como posso ajudar? 😊',
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
    const shouldSendVideo = parsedResponse.should_send_video && !!aiConfig.video_url;
    const shouldSendSite = parsedResponse.should_send_site && !!aiConfig.site_url;
    const needsHuman = parsedResponse.should_handoff || finalStage === 'STAGE_5';

    // Log AI decision
    await supabase
      .from('whatsapp_ai_logs')
      .insert({
        conversation_id,
        incoming_message,
        ai_response: parsedResponse.response,
        detected_intent: `${finalStage} - BANT: ${JSON.stringify(parsedResponse.bant_score || {})}`,
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
        should_send_video: shouldSendVideo,
        should_send_site: shouldSendSite,
        should_handoff: needsHuman,
        handoff_reason: parsedResponse.handoff_reason || null,
        needs_human: needsHuman,
        video_url: shouldSendVideo ? aiConfig.video_url : null,
        site_url: shouldSendSite ? aiConfig.site_url : null,
        delay_seconds: aiConfig.auto_reply_delay_seconds || 5,
        bant_score: parsedResponse.bant_score || null
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

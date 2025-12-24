import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel - 5 estágios de IA + 3 manuais
// IA controla: STAGE_1 a STAGE_5 (Lead Novo até Handoff)
// Manual (vendedor): STAGE_6, STAGE_7, STAGE_8
const CRM_STAGES = {
  STAGE_1: { id: 'new', name: 'Lead Novo', order: 1 },
  STAGE_2: { id: 'qualification', name: 'Levantamento', order: 2 },
  STAGE_3: { id: 'presentation', name: 'Apresentação', order: 3 },
  STAGE_4: { id: 'interest', name: 'Interesse Confirmado', order: 4 },
  STAGE_5: { id: 'handoff', name: 'Handoff', order: 5 },
  // Estágios manuais - IA NÃO responde
  STAGE_6: { id: 'negotiating', name: 'Negociando', order: 6 },
  STAGE_7: { id: 'converted', name: 'Convertido', order: 7 },
  STAGE_8: { id: 'lost', name: 'Perdido', order: 8 },
} as const;

type CRMStage = keyof typeof CRM_STAGES;

function getStageFromLabelId(labelId: string): CRMStage | null {
  for (const [stage, info] of Object.entries(CRM_STAGES)) {
    if (info.id === labelId) return stage as CRMStage;
  }
  return null;
}

// ========== DETECÇÃO DE BOTS/ROBÔS ==========
const BOT_PATTERNS = [
  /aguarde.*transferindo/i,
  /transferindo.*atendente/i,
  /horário de atendimento/i,
  /fora do horário/i,
  /escolha.*opção/i,
  /digite.*número/i,
  /opção.*inválida/i,
  /férias coletivas/i,
  /recesso/i,
  /não estamos atendendo/i,
  /atendimento encerrado/i,
  /deixe.*mensagem/i,
  /retornaremos.*contato/i,
  /^[1-9]$/,
  /^\*[1-9]\*/,
  /menu principal/i,
  /voltar.*menu/i,
  /bem-vindo.*atendimento/i,
  /olá.*sou.*assistente virtual/i,
  /sou.*robô/i,
  /atendimento automático/i,
  /aguarde.*atendente/i,
  /em breve.*atendente/i,
  /tempo de espera/i,
  /posição na fila/i,
];

// Padrões de inversão de papéis (lead é atendente)
const ROLE_INVERSION_PATTERNS = [
  /em que (eu )?posso (te )?ajudar/i,
  /como posso (te )?ajudar/i,
  /o que (você )?deseja/i,
  /o que (você )?precisa/i,
  /qual.*seu.*pedido/i,
  /posso (te )?auxiliar/i,
  /em que posso ser útil/i,
  /com o que posso ajudar/i,
  /pois não/i,
  /diga/i,
];

// ========== DETECÇÃO DE REJEIÇÃO ==========
const REJECTION_PATTERNS = [
  /não (tenho |quero|preciso|interess)/i,
  /sem interesse/i,
  /não é pra mim/i,
  /não me interessa/i,
  /pare de me (mandar|enviar)/i,
  /não me (mande|envie) mais/i,
  /me (tire|remova|exclua) da lista/i,
  /cancelar/i,
  /sair da lista/i,
  /desinscrever/i,
  /não quero (mais )?receber/i,
  /obrigad[ao],? (mas )?não/i,
  /agora não/i,
  /não é o momento/i,
  /talvez depois/i,
  /quem sabe (depois|outro dia)/i,
  /deixa pra lá/i,
  /tchau/i,
  /até mais/i,
  /adeus/i,
];

function detectBotMessage(message: string): { isBot: boolean; reason: string | null } {
  const normalizedMsg = message.toLowerCase().trim();
  
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] Bot detected! Pattern matched:', pattern.toString());
      return { isBot: true, reason: `Padrão detectado: ${pattern.toString()}` };
    }
  }
  
  if (/^[0-9\s\*#]+$/.test(normalizedMsg) && normalizedMsg.length < 5) {
    return { isBot: true, reason: 'Resposta de menu numérico' };
  }
  
  return { isBot: false, reason: null };
}

function detectRoleInversion(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  
  for (const pattern of ROLE_INVERSION_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] Role inversion detected! Lead is asking how to help us');
      return true;
    }
  }
  
  return false;
}

function detectRejection(message: string): { isRejection: boolean; type: 'hard' | 'soft' | null } {
  const normalizedMsg = message.toLowerCase().trim();
  
  const hardRejectionPatterns = [
    /pare de me (mandar|enviar)/i,
    /não me (mande|envie) mais/i,
    /me (tire|remova|exclua) da lista/i,
    /desinscrever/i,
    /cancelar/i,
    /sair da lista/i,
  ];
  
  for (const pattern of hardRejectionPatterns) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] Hard rejection detected:', pattern.toString());
      return { isRejection: true, type: 'hard' };
    }
  }
  
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] Soft rejection detected:', pattern.toString());
      return { isRejection: true, type: 'soft' };
    }
  }
  
  return { isRejection: false, type: null };
}

function cleanIncomingMessage(raw: string): string {
  if (!raw) return '';
  
  if (raw.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.buttonsMessage?.contentText) {
        return parsed.buttonsMessage.contentText;
      }
      if (parsed.listMessage?.description) {
        return parsed.listMessage.description;
      }
      if (parsed.message) {
        return parsed.message;
      }
      if (parsed.text) {
        return parsed.text;
      }
    } catch {
      // Não é JSON válido, retorna original
    }
  }
  return raw;
}

// Extrai informações já respondidas do histórico para evitar repetição
function extractAnsweredTopics(history: Array<{ direction: string; content: string }>): {
  urgencyAnswered: boolean;
  painAnswered: boolean;
  nameIdentified: boolean;
  businessContext: string | null;
} {
  const result = {
    urgencyAnswered: false,
    painAnswered: false,
    nameIdentified: false,
    businessContext: null as string | null
  };
  
  const urgencyPatterns = [
    /urgente/i, /urgência/i, /preciso resolver/i, /pressa/i, /rápido/i,
    /muito urgente/i, /logo/i, /imediato/i, /ontem/i, /pra ontem/i
  ];
  
  const painPatterns = [
    /problema é/i, /dificuldade/i, /desafio/i, /dor de cabeça/i,
    /não consigo/i, /preciso de/i, /falta de/i, /pouco/i, /baixo/i,
    /vendas fracas/i, /demanda/i, /clientes/i, /lead/i, /tráfego/i
  ];
  
  for (const msg of history) {
    if (msg.direction === 'incoming' && msg.content) {
      const content = msg.content.toLowerCase();
      
      // Verificar se urgência já foi respondida
      for (const pattern of urgencyPatterns) {
        if (pattern.test(content)) {
          result.urgencyAnswered = true;
          break;
        }
      }
      
      // Verificar se dor/problema já foi mencionado
      for (const pattern of painPatterns) {
        if (pattern.test(content)) {
          result.painAnswered = true;
          break;
        }
      }
      
      // Extrair contexto de negócio se mencionado
      const businessMatch = content.match(/(trabalho com|minha empresa|meu negócio|faço|vendo|ofereço|área de|segmento de|setor de)\s*([^.,!?]+)/i);
      if (businessMatch) {
        result.businessContext = businessMatch[0];
      }
    }
  }
  
  return result;
}

// Conta mensagens OUTGOING na fase atual baseado no campo da conversation
function countMessagesInCurrentStage(
  history: Array<{ direction: string; content: string }>,
  currentStageOrder: number
): number {
  // Conta mensagens outgoing consecutivas recentes (aproximação)
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'outgoing') {
      count++;
    } else {
      // Se encontra incoming (lead), para de contar
      break;
    }
  }
  return count;
}

function countConsecutiveAIResponses(history: Array<{ direction: string; content: string }>): number {
  let count = 0;
  
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    
    if (msg.direction === 'outgoing') {
      count++;
    } else {
      const botCheck = detectBotMessage(msg.content || '');
      if (botCheck.isBot) {
        continue;
      } else {
        break;
      }
    }
  }
  
  return count;
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
    const { conversation_id, incoming_message, conversation_history, current_stage_id, lead_name } = await req.json();

    if (!conversation_id || !incoming_message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and incoming_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados da conversa para pegar messages_in_current_stage do banco
    const { data: conversationData } = await supabase
      .from('whatsapp_conversations')
      .select('messages_in_current_stage')
      .eq('id', conversation_id)
      .single();
    
    const dbMessagesInStage = conversationData?.messages_in_current_stage || 0;

    const cleanedMessage = cleanIncomingMessage(incoming_message);
    console.log('[AI] Incoming message cleaned:', cleanedMessage.substring(0, 100));

    // Buscar configuração centralizada (agora inclui persona, oferta, etc)
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

    console.log('[AI] Using unified config - Persona:', aiConfig.persona_name || 'not set');

    const currentStage = current_stage_id ? getStageFromLabelId(current_stage_id) : 'STAGE_1';
    const currentOrder = currentStage ? CRM_STAGES[currentStage as CRMStage]?.order || 1 : 1;

    // Se já está em STAGE_6+ (negociação/fechado), não responder (vendedor assumiu)
    if (currentOrder >= 6) {
      console.log('[AI] Lead já em negociação ou fechado, vendedor deve atender');
      return new Response(
        JSON.stringify({ 
          error: 'Lead in seller stage', 
          should_respond: false,
          handoff: true,
          message: 'Lead já está com vendedor (negociação/fechado), IA não responde'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE REJEIÇÃO ==========
    const rejectionCheck = detectRejection(cleanedMessage);
    if (rejectionCheck.isRejection) {
      console.log('[AI] Rejection detected! Type:', rejectionCheck.type);
      
      let rejectionResponse: string;
      let newStage: string;
      
      if (rejectionCheck.type === 'hard') {
        rejectionResponse = 'Entendido! Você não receberá mais mensagens. Se mudar de ideia, é só chamar. 👋';
        newStage = 'STAGE_7';
        
        const { data: conversation } = await supabase
          .from('whatsapp_conversations')
          .select('phone')
          .eq('id', conversation_id)
          .single();
        
        if (conversation?.phone) {
          await supabase
            .from('whatsapp_blacklist')
            .upsert({
              phone: conversation.phone.replace(/\D/g, ''),
              reason: 'opt_out',
              keyword_matched: 'Rejeição explícita do lead'
            }, { onConflict: 'phone' });
        }
      } else {
        rejectionResponse = 'Sem problemas! Fico à disposição se precisar de algo no futuro. 😊';
        newStage = 'STAGE_7';
      }
      
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: true,
          ai_handoff_reason: `Lead recusou: ${rejectionCheck.type}`,
          funnel_stage: newStage === 'STAGE_7' ? 'lost' : 'nurturing'
        })
        .eq('id', conversation_id);
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: rejectionResponse,
          detected_intent: `REJECTION_${rejectionCheck.type?.toUpperCase()}`,
          confidence_score: 0.95,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: rejectionResponse,
          stage: newStage,
          label_id: CRM_STAGES[newStage as CRMStage]?.id || '23',
          is_rejection: true,
          rejection_type: rejectionCheck.type,
          should_handoff: false,
          ai_paused: true,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 3
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE BOT ==========
    const botCheck = detectBotMessage(cleanedMessage);
    const isRoleInverted = detectRoleInversion(cleanedMessage);
    const consecutiveAIResponses = countConsecutiveAIResponses(conversation_history || []);
    
    console.log('[AI] Bot check:', botCheck.isBot, '| Role inverted:', isRoleInverted, '| Consecutive AI:', consecutiveAIResponses);

    if (consecutiveAIResponses >= 3) {
      console.log('[AI] Too many consecutive AI responses, possible bot loop. Pausing.');
      
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: true,
          ai_handoff_reason: 'IA pausada automaticamente - possível loop com bot/robô'
        })
        .eq('id', conversation_id);
      
      return new Response(
        JSON.stringify({
          response: null,
          should_respond: false,
          is_bot_loop: true,
          message: 'IA pausada - detectado possível loop com bot/robô',
          consecutive_ai_responses: consecutiveAIResponses
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (botCheck.isBot) {
      console.log('[AI] Bot message detected, responding with simple acknowledgment');
      
      const botResponse = 'Entendido! Fico no aguardo de um atendente 😊';
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: botResponse,
          detected_intent: `BOT_DETECTED: ${botCheck.reason}`,
          confidence_score: 0.95,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: botResponse,
          stage: currentStage || 'STAGE_1',
          label_id: CRM_STAGES[currentStage as CRMStage]?.id || '16',
          is_bot_message: true,
          bot_reason: botCheck.reason,
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 5
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== BUSCAR PROMPT GENÉRICO DA FASE ==========
    let stagePrompt = null;
    
    const { data: genericStagePrompt } = await supabase
      .from('ai_stage_prompts')
      .select('*')
      .eq('stage_id', currentStage)
      .eq('is_active', true)
      .maybeSingle();
    
    if (genericStagePrompt) {
      stagePrompt = genericStagePrompt;
      console.log('[AI] Using stage prompt for', currentStage);
    }

    // Usar valor do banco (mais preciso) ou fallback para contagem do histórico
    const messagesInStage = dbMessagesInStage > 0 ? dbMessagesInStage : countMessagesInCurrentStage(conversation_history || [], currentOrder);
    const maxMessagesInStage = stagePrompt?.max_messages_in_stage || 5;
    
    console.log('[AI] Messages in stage (from DB):', dbMessagesInStage, '| calculated:', countMessagesInCurrentStage(conversation_history || [], currentOrder), '| using:', messagesInStage, '/', maxMessagesInStage);

    const forceAdvance = messagesInStage >= maxMessagesInStage;
    if (forceAdvance) {
      console.log('[AI] Max messages in stage reached, will force advance');
    }

    const recentHistory = (conversation_history || []).slice(-10);
    const historyMessages = recentHistory.map((msg: { direction: string; content: string }) => ({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: cleanIncomingMessage(msg.content || '')
    }));
    historyMessages.push({ role: 'user', content: cleanedMessage });

    // ========== EXTRAIR TÓPICOS JÁ RESPONDIDOS (ANTI-REPETIÇÃO + ANTI-ALUCINAÇÃO) ==========
    const answeredTopics = extractAnsweredTopics(conversation_history || []);
    const businessContextKnown = !!answeredTopics.businessContext;
    console.log('[AI] Answered topics:', JSON.stringify(answeredTopics), '| Business context known:', businessContextKnown);
    
    // Construir contexto anti-repetição para a IA
    let antiRepetitionContext = '';
    if (answeredTopics.urgencyAnswered || answeredTopics.painAnswered || answeredTopics.businessContext) {
      antiRepetitionContext = `
⚠️ INFORMAÇÕES JÁ COLETADAS (NÃO PERGUNTE DE NOVO):
${answeredTopics.urgencyAnswered ? '- ✅ URGÊNCIA: Lead JÁ disse que é urgente - NÃO pergunte novamente!' : ''}
${answeredTopics.painAnswered ? '- ✅ DOR/PROBLEMA: Lead JÁ explicou sua dor/desafio - NÃO pergunte novamente!' : ''}
${answeredTopics.businessContext ? `- ✅ CONTEXTO DO NEGÓCIO: "${answeredTopics.businessContext}"` : ''}
`;
    }
    
    // 🚨 ANTI-ALUCINAÇÃO: Se não sabemos o contexto do negócio, adicionar regra estrita
    const antiHallucinationRule = !businessContextKnown ? `
🚨 REGRA ANTI-ALUCINAÇÃO (OBRIGATÓRIA):
- Você NÃO sabe qual é o negócio/segmento do lead
- NÃO INVENTE exemplos específicos (ex: "caixas personalizadas", "loja de roupas", etc.)
- Use apenas termos GENÉRICOS como: "seu negócio", "sua empresa", "seu serviço", "seu produto"
- Se precisar citar exemplos, diga: "independente do segmento que você atua" ou "seja qual for seu mercado"
- PERGUNTE sobre o negócio ao invés de presumir
` : '';

    // URLs da configuração unificada
    const videoUrl = aiConfig.video_url;
    const siteUrl = aiConfig.site_url;
    const paymentLink = aiConfig.payment_link;
    
    const roleInversionContext = isRoleInverted 
      ? `\n\n⚠️ ATENÇÃO: O lead perguntou "em que posso ajudar" - ELE É UM ATENDENTE. 
         APRESENTE-SE explicando quem você é e por que está entrando em contato. NÃO pergunte o nome.`
      : '';
    
    // ========== CONSTRUIR PROMPT COM CONTEXTO DO NEGÓCIO ==========
    let systemPromptForPhase: string;
    
    // IMPORTANTE: Na STAGE_1 (cold call), NÃO revelamos contexto do negócio
    // O SDR precisa gerar curiosidade primeiro, SEM falar da empresa/produto
    const shouldIncludeBusinessContext = currentOrder >= 2;
    
    // Pegar apenas o primeiro nome da persona
    const personaFirstName = aiConfig.persona_name?.split(' ')[0] || 'SDR';
    
    // Contexto mínimo para STAGE_1 (cold call)
    const minimalContext = `
IDENTIDADE MÍNIMA:
- Seu primeiro nome: ${personaFirstName}
- Área: marketing/negócios (genérico, NÃO mencione empresa)
- Tom: profissional e respeitoso

REGRAS DE SAUDAÇÃO (OBRIGATÓRIO):
✅ Use APENAS: "Olá!", "Bom dia!", "Boa tarde!", "Boa noite!", "Prazer!"
❌ NUNCA use gírias ou informalidades: "E aí", "Opa", "Eae", "Fala", "Beleza", "Tudo certo?"
- Mantenha tom cordial e profissional desde a primeira mensagem`;

    // Contexto completo do negócio (STAGE_2+)
    const fullBusinessContext = `
IDENTIDADE:
- Persona: ${aiConfig.persona_name || 'Assistente de Vendas'}
- Tom de voz: ${aiConfig.tone || 'profissional'}
- Público-alvo: ${aiConfig.target_audience || 'não especificado'}

OFERTA:
${aiConfig.offer_description || 'Não especificada'}

URLs DISPONÍVEIS:
${videoUrl ? `- Vídeo: ${videoUrl}` : ''}
${siteUrl ? `- Site: ${siteUrl}` : ''}
${paymentLink ? `- Link de Pagamento: ${paymentLink}` : ''}`;

    // Escolher contexto baseado na fase
    const businessContext = shouldIncludeBusinessContext ? fullBusinessContext : minimalContext;
    
    if (stagePrompt) {
      systemPromptForPhase = `${stagePrompt.system_prompt}

${businessContext}
${antiRepetitionContext}
${antiHallucinationRule}

CONTEXTO DA CONVERSA:
- Nome do lead: ${lead_name || 'não identificado'}
- Você está na fase: ${stagePrompt.stage_name} (${currentStage})
- Objetivo: ${stagePrompt.objective}
- Critério de sucesso: ${stagePrompt.success_criteria || 'N/A'}
- Mensagens nesta fase: ${messagesInStage}/${maxMessagesInStage}
- Contexto do negócio conhecido: ${businessContextKnown ? 'SIM' : 'NÃO - use termos genéricos!'}
${forceAdvance ? '- ⚠️ LIMITE ATINGIDO: Tente avançar ou fazer handoff nesta mensagem!' : ''}
${roleInversionContext}`;
    } else {
      systemPromptForPhase = `${aiConfig.system_prompt}

${businessContext}
${antiRepetitionContext}
${antiHallucinationRule}

CONTEXTO:
- Nome do lead: ${lead_name || 'não identificado'}
- Fase atual: ${CRM_STAGES[currentStage as CRMStage]?.name || 'Lead Novo'} (${currentStage})
- Mensagens nesta fase: ${messagesInStage}
- Contexto do negócio conhecido: ${businessContextKnown ? 'SIM' : 'NÃO - use termos genéricos!'}
${roleInversionContext}`;
    }
    
    const fullPrompt = `
${systemPromptForPhase}

RESPONDA EM JSON COM ESTE FORMATO EXATO:
{
  "response": "sua resposta aqui (MÁXIMO 250 caracteres)",
  "achieved_objective": true/false,
  "should_advance": true/false,
  "next_stage": "STAGE_1" ou "STAGE_2" ou "STAGE_3" ou "STAGE_4" ou "STAGE_5",
  "lead_name": "nome do lead se identificado, ou null",
  "should_send_video": true/false,
  "should_send_site": true/false,
  "should_handoff": true/false,
  "handoff_reason": "motivo curto se should_handoff=true"
}

ESTÁGIOS DA IA (você controla estes):
- STAGE_1: Lead Novo - Gerar curiosidade, descobrir quem é (área/cargo)
- STAGE_2: Levantamento - Descobrir dor principal, contexto do negócio, urgência
- STAGE_3: Apresentação - Apresentar metodologia/solução, enviar vídeo, mostrar valor
- STAGE_4: Interesse Confirmado - Confirmar interesse genuíno, coletar dados para call
- STAGE_5: Handoff - Agendar conversa com especialista, passar para vendedor

REGRAS CRÍTICAS:
1. Resposta CURTA (máximo 250 caracteres)
2. Avance APENAS 1 estágio por vez
3. Se should_handoff=true, next_stage deve ser STAGE_5
4. should_advance só é true se o objetivo da fase foi alcançado
5. Use o nome do lead sempre que souber
6. NUNCA vá além de STAGE_5 - negociação é trabalho do vendedor humano

🚨 REGRA DE HANDOFF (OBRIGATÓRIA):
Quando should_handoff=true, a "response" DEVE ser uma mensagem de despedida profissional que:
- Avisa que está transferindo para um consultor/especialista
- Agradece pela conversa
- Exemplo: "Perfeito, [Nome]! Vou transferir você para nosso consultor especializado. Ele vai entrar em contato em instantes para dar sequência. Foi ótimo falar com você! 🤝"
❌ NUNCA deixe a IA "sumir" sem avisar - o lead precisa saber que um humano vai assumir!

Histórico recente:
${historyMessages.slice(-6).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última mensagem: "${cleanedMessage}"
`;

    console.log('[AI] Calling OpenAI - Stage:', currentStage, 'Order:', currentOrder, 'Persona:', aiConfig.persona_name || 'default', 'StagePrompt:', !!stagePrompt);

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
          ...historyMessages.slice(-6)
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 400
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
      // Resposta de fallback adequada para cold call (STAGE_1)
      const fallbackResponse = currentOrder === 1 
        ? `Opa! Me chamo ${personaFirstName}, trabalho com marketing. Com quem falo? 😊`
        : 'Olá! Me conta mais sobre seu negócio? 😊';
      parsedResponse = {
        response: fallbackResponse,
        achieved_objective: false,
        should_advance: false,
        next_stage: currentStage,
        should_send_video: false,
        should_send_site: false,
        should_handoff: false
      };
    }

    // 🚨 FALLBACK DE HANDOFF: Garantir mensagem de despedida quando should_handoff=true
    if (parsedResponse.should_handoff) {
      const response = parsedResponse.response?.toLowerCase() || '';
      const hasHandoffMessage = response.includes('consultor') || 
                                response.includes('especialista') || 
                                response.includes('transferir') ||
                                response.includes('entrar em contato') ||
                                response.includes('atendente');
      
      if (!hasHandoffMessage) {
        console.log('[AI] Handoff without proper message, adding farewell');
        const leadNameForHandoff = parsedResponse.lead_name || lead_name;
        parsedResponse.response = leadNameForHandoff 
          ? `Perfeito, ${leadNameForHandoff}! Vou transferir você para nosso consultor especializado. Ele vai entrar em contato em instantes para dar sequência. Foi ótimo falar com você! 🤝`
          : `Perfeito! Vou transferir você para nosso consultor especializado. Ele vai entrar em contato em instantes para dar sequência. Foi ótimo falar com você! 🤝`;
      }
    }

    let finalStage = parsedResponse.next_stage || currentStage;
    
    if (forceAdvance && !parsedResponse.should_advance && currentOrder < 5) {
      const nextOrder = Math.min(currentOrder + 1, 5);
      const nextStageEntry = Object.entries(CRM_STAGES).find(([, info]) => info.order === nextOrder);
      if (nextStageEntry) {
        finalStage = nextStageEntry[0] as CRMStage;
        console.log('[AI] Force advancing to:', finalStage);
      }
    }
    
    const finalOrder = CRM_STAGES[finalStage as CRMStage]?.order || 1;
    if (currentOrder > finalOrder) {
      finalStage = currentStage;
    }

    // Limitar avanço a 1 estágio por vez
    if (!parsedResponse.should_handoff && finalOrder > currentOrder + 1) {
      const nextStage = Object.entries(CRM_STAGES).find(([, info]) => info.order === currentOrder + 1);
      if (nextStage) {
        finalStage = nextStage[0] as CRMStage;
      }
    }

    // Handoff vai para STAGE_5 (último estágio da IA)
    if (parsedResponse.should_handoff) {
      finalStage = 'STAGE_5';
    }

    // NUNCA ultrapassar STAGE_5 - IA não negocia
    const finalOrderCheck = CRM_STAGES[finalStage as CRMStage]?.order || 1;
    if (finalOrderCheck > 5) {
      finalStage = 'STAGE_5';
    }

    const labelId = CRM_STAGES[finalStage as CRMStage]?.id || 'new';
    const shouldSendVideo = parsedResponse.should_send_video && !!videoUrl;
    const shouldSendSite = parsedResponse.should_send_site && !!siteUrl;
    const needsHuman = parsedResponse.should_handoff || finalStage === 'STAGE_5';

    // 🚨 CRÍTICO: Sempre atualizar funnel_stage + pausar IA no handoff
    if (finalStage === currentStage) {
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          funnel_stage: labelId,  // Garante consistência
          messages_in_current_stage: messagesInStage + 1,
          name: parsedResponse.lead_name || lead_name || undefined,
          ai_paused: needsHuman,
          ai_handoff_reason: needsHuman ? (parsedResponse.handoff_reason || 'Interesse confirmado - aguardando consultor') : undefined
        })
        .eq('id', conversation_id);
    } else {
      console.log('[AI] Stage transition:', currentStage, '->', finalStage, 'labelId:', labelId);
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          funnel_stage: labelId,  // ATUALIZA A FASE!
          messages_in_current_stage: 0,
          name: parsedResponse.lead_name || lead_name || undefined,
          ai_paused: needsHuman,
          ai_handoff_reason: needsHuman ? (parsedResponse.handoff_reason || 'Interesse confirmado - aguardando consultor') : undefined
        })
        .eq('id', conversation_id);
    }

    await supabase
      .from('whatsapp_ai_logs')
      .insert({
        conversation_id,
        incoming_message: cleanedMessage,
        ai_response: parsedResponse.response,
        detected_intent: `${finalStage} | Obj: ${parsedResponse.achieved_objective} | Adv: ${parsedResponse.should_advance} | StagePrompt: ${stagePrompt?.stage_name || 'legacy'}`,
        applied_label_id: labelId,
        confidence_score: 0.9,
        needs_human: needsHuman
      });

    console.log('[AI] Response ready - Stage:', finalStage, 'Handoff:', needsHuman, 'Label:', labelId, 'Objective achieved:', parsedResponse.achieved_objective);

    return new Response(
      JSON.stringify({
        response: parsedResponse.response,
        stage: finalStage,
        label_id: labelId,
        lead_name: parsedResponse.lead_name || lead_name || null,
        achieved_objective: parsedResponse.achieved_objective,
        should_advance: parsedResponse.should_advance,
        should_send_video: shouldSendVideo,
        should_send_site: shouldSendSite,
        should_handoff: needsHuman,
        handoff_reason: parsedResponse.handoff_reason || null,
        needs_human: needsHuman,
        video_url: shouldSendVideo ? videoUrl : null,
        site_url: shouldSendSite ? siteUrl : null,
        payment_link: paymentLink || null,
        delay_seconds: aiConfig.auto_reply_delay_seconds || 5,
        stage_prompt_used: stagePrompt?.stage_name || null,
        messages_in_stage: messagesInStage + 1,
        max_messages_in_stage: maxMessagesInStage,
        persona_used: aiConfig.persona_name || null
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

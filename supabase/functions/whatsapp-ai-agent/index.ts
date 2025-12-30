import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SDR Funnel - 5 estágios de IA + 3 manuais
const CRM_STAGES = {
  STAGE_1: { id: 'new', name: 'Lead Novo', order: 1 },
  STAGE_2: { id: 'qualification', name: 'Levantamento', order: 2 },
  STAGE_3: { id: 'presentation', name: 'Apresentação', order: 3 },
  STAGE_4: { id: 'interest', name: 'Interesse Confirmado', order: 4 },
  STAGE_5: { id: 'handoff', name: 'Handoff', order: 5 },
  STAGE_6: { id: 'negotiating', name: 'Negociando', order: 6 },
  STAGE_7: { id: 'converted', name: 'Convertido', order: 7 },
  STAGE_8: { id: 'lost', name: 'Perdido', order: 8 },
} as const;

type CRMStage = keyof typeof CRM_STAGES;

// 🆕 CAMADA 1: Normalização de stage_id
function normalizeStageId(rawStageId: string | null | undefined): CRMStage {
  if (!rawStageId) return 'STAGE_1';
  
  // Se já é STAGE_X, retorna direto
  if (rawStageId.startsWith('STAGE_')) {
    const validStages = Object.keys(CRM_STAGES);
    if (validStages.includes(rawStageId)) {
      return rawStageId as CRMStage;
    }
  }
  
  // Mapear label_id para STAGE_X
  for (const [stage, info] of Object.entries(CRM_STAGES)) {
    if (info.id === rawStageId) {
      return stage as CRMStage;
    }
  }
  
  // Fallback
  console.log('[AI] Stage normalization fallback for:', rawStageId);
  return 'STAGE_1';
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

// Padrões de atendimento automático de empresa
const BUSINESS_AUTO_RESPONSE_PATTERNS = [
  /forneça as informações/i,
  /modelo (da sua preferência|desejado)/i,
  /qual (a )?quantidade/i,
  /data do (seu )?evento/i,
  /preencha (os|as) (dados|informações)/i,
  /informe (seu nome|telefone|e-?mail)/i,
  /segue nosso cardápio/i,
  /nossos produtos/i,
  /tabela de preços/i,
  /orçamento.*informe/i,
  /@instagram|@[\w.]+/i,
  /www\.[a-z0-9.-]+/i,
  /faça seu pedido/i,
  /escolha.*opção/i,
  /aguardamos seu pedido/i,
  /personalização.*(?:nome|modelo|cor|tamanho)/i,
  /(?:nome|modelo|cor|tamanho|quantidade).*(?:\?|:)/i,
];

// ========== DETECÇÃO DE REJEIÇÃO (EXPANDIDA) ==========
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
  /já tenho (pessoas|equipe|fornecedor)/i,
  /já trabalho com/i,
  /não preciso/i,
  /tenho quem (me |)ajud/i,
  /estou bem (assim|servido)/i,
  /não to precisando/i,
  /valeu mas não/i,
];

// ========== DETECÇÃO DE "SOU BOT?" ==========
const AM_I_BOT_PATTERNS = [
  /você é (um )?rob[oô]/i,
  /é (um )?rob[oô]/i,
  /você é bot/i,
  /é bot\??/i,
  /isso é (um )?chatbot/i,
  /tá falando com (um )?rob[oô]/i,
  /é automático/i,
  /é inteligência artificial/i,
  /é ia\??/i,
  /tô falando com máquina/i,
  /você é humano/i,
  /é pessoa real/i,
  /é gente\??/i,
];

// ========== DETECÇÃO DE "QUEM É VOCÊ?" ==========
const WHO_ARE_YOU_PATTERNS = [
  /quem é você/i,
  /quem (tá|está) falando/i,
  /com quem (eu )?falo/i,
  /quem (é|me) (esse|vc|você)/i,
  /de onde (é|você é|vc é)/i,
  /qual (sua |a )empresa/i,
  /o que (você|vocês) faz(em)?/i,
  /do que se trata/i,
  /qual.*assunto/i,
  /pq (tá|está) me chamando/i,
  /por ?que.*contato/i,
  /conhece de onde/i,
  /te conheço/i,
];

// ========== DETECÇÃO DE RESPOSTAS FRIAS ==========
const COLD_RESPONSE_PATTERNS = [
  /^(oi|opa|olá|ola|eae|eai|fala|blz|beleza|ok|sim|n[aã]o|hm+|ah|é|e ai|oq|oque)$/i,
  /^\.+$/,
  /^\?+$/,
  /^(k+|kk+|kkk+|rs+|haha+|hehe+)$/i,
];

// ========== DETECÇÃO DE "QUERO SABER MAIS" ==========
const WANTS_INFO_PATTERNS = [
  /quero saber mais/i,
  /me conta mais/i,
  /como funciona/i,
  /o que vocês fazem/i,
  /pode explicar/i,
  /me explica/i,
  /saber mais/i,
  /fala mais/i,
  /conta mais/i,
  /explica melhor/i,
  /entendi.*fala/i,
  /interessante.*mais/i,
  /quero entender/i,
];

// ========== DETECÇÃO DE PEDIDO EXPLÍCITO DE REUNIÃO ==========
const WANTS_MEETING_PATTERNS = [
  /quero agendar/i,
  /pode agendar/i,
  /agendar uma (call|reunião|conversa)/i,
  /marcar uma (call|reunião|conversa)/i,
  /vamos conversar/i,
  /podemos marcar/i,
  /quanto custa/i,
  /qual o (preço|valor|investimento)/i,
  /quero contratar/i,
  /como faço pra (contratar|começar)/i,
];

function detectWantsMoreInfo(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  for (const pattern of WANTS_INFO_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] "Wants more info" detected:', pattern.toString());
      return true;
    }
  }
  return false;
}

function detectWantsMeeting(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  for (const pattern of WANTS_MEETING_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] "Wants meeting" explicitly detected:', pattern.toString());
      return true;
    }
  }
  return false;
}

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

function detectBusinessAutoResponse(message: string): { isBusinessAuto: boolean; reason: string | null } {
  const normalizedMsg = message.toLowerCase().trim();
  
  let matchCount = 0;
  let matchedPatterns: string[] = [];
  
  for (const pattern of BUSINESS_AUTO_RESPONSE_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      matchCount++;
      matchedPatterns.push(pattern.toString());
    }
  }
  
  if (normalizedMsg.length > 100 && matchCount >= 2) {
    console.log('[AI] Business auto-response detected! Patterns:', matchedPatterns.join(', '));
    return { isBusinessAuto: true, reason: `${matchCount} padrões: ${matchedPatterns.slice(0, 3).join(', ')}` };
  }
  
  if (matchCount >= 3) {
    console.log('[AI] Business auto-response detected (short msg)! Patterns:', matchedPatterns.join(', '));
    return { isBusinessAuto: true, reason: `${matchCount} padrões: ${matchedPatterns.slice(0, 3).join(', ')}` };
  }
  
  return { isBusinessAuto: false, reason: null };
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

function detectAmIBot(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  for (const pattern of AM_I_BOT_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] "Am I a bot?" question detected');
      return true;
    }
  }
  return false;
}

function detectWhoAreYou(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  for (const pattern of WHO_ARE_YOU_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] "Who are you?" question detected');
      return true;
    }
  }
  return false;
}

function detectColdResponse(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  if (normalizedMsg.length < 10) {
    for (const pattern of COLD_RESPONSE_PATTERNS) {
      if (pattern.test(normalizedMsg)) {
        console.log('[AI] Cold/monosyllabic response detected');
        return true;
      }
    }
  }
  return false;
}

function countConsecutiveAIQuestions(history: Array<{ direction: string; content: string }>): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.direction === 'outgoing') {
      if (msg.content?.trim().endsWith('?')) {
        count++;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return count;
}

function countConsecutiveColdResponses(history: Array<{ direction: string; content: string }>): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.direction === 'incoming') {
      if (detectColdResponse(msg.content || '')) {
        count++;
      } else {
        break;
      }
    }
  }
  return count;
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
      // Não é JSON válido
    }
  }
  return raw;
}

function extractAnsweredTopics(history: Array<{ direction: string; content: string }>): {
  urgencyAnswered: boolean;
  painAnswered: boolean;
  nameIdentified: boolean;
  businessContext: string | null;
  valueDelivered: boolean;
} {
  const result = {
    urgencyAnswered: false,
    painAnswered: false,
    nameIdentified: false,
    businessContext: null as string | null,
    valueDelivered: false
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

  // 🆕 CAMADA 2: Detectar se já entregamos valor
  const valuePatterns = [
    /ajudo.*empresas/i, /trabalhamos com/i, /nossa metodologia/i,
    /gerar.*clientes/i, /aumentar.*vendas/i, /escalar/i
  ];
  
  for (const msg of history) {
    const content = (msg.content || '').toLowerCase();
    
    if (msg.direction === 'incoming') {
      for (const pattern of urgencyPatterns) {
        if (pattern.test(content)) {
          result.urgencyAnswered = true;
          break;
        }
      }
      
      for (const pattern of painPatterns) {
        if (pattern.test(content)) {
          result.painAnswered = true;
          break;
        }
      }
      
      const businessMatch = content.match(/(trabalho com|minha empresa|meu negócio|faço|vendo|ofereço|área de|segmento de|setor de)\s*([^.,!?]+)/i);
      if (businessMatch) {
        result.businessContext = businessMatch[0];
      }
    }
    
    // Verificar se IA já entregou valor
    if (msg.direction === 'outgoing') {
      for (const pattern of valuePatterns) {
        if (pattern.test(content)) {
          result.valueDelivered = true;
          break;
        }
      }
    }
  }
  
  return result;
}

function countMessagesInCurrentStage(
  history: Array<{ direction: string; content: string }>,
  currentStageOrder: number
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'outgoing') {
      count++;
    } else {
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

// ========== 🆕 CAMADA 2: DECISÕES DETERMINÍSTICAS ==========
interface DeterministicDecision {
  shouldHandoff: boolean;
  handoffReason: string | null;
  blockHandoff: boolean;
  blockReason: string | null;
  requireValue: boolean;
  forcedResponse: string | null;
}

function makeDeterministicDecisions(
  cleanedMessage: string,
  history: Array<{ direction: string; content: string }>,
  currentOrder: number,
  wantsMoreInfo: boolean,
  wantsMeeting: boolean,
  valueDelivered: boolean,
  personaFirstName: string,
  offerDescription: string
): DeterministicDecision {
  const result: DeterministicDecision = {
    shouldHandoff: false,
    handoffReason: null,
    blockHandoff: false,
    blockReason: null,
    requireValue: false,
    forcedResponse: null
  };

  // 🆕 REGRA 1: "Quero saber mais" = PROIBIDO handoff, OBRIGADO dar valor
  if (wantsMoreInfo) {
    result.blockHandoff = true;
    result.blockReason = 'Lead quer informação, não reunião';
    result.requireValue = true;
    
    // Gerar resposta de valor direta se não entregou ainda
    if (!valueDelivered) {
      const offerShort = offerDescription?.substring(0, 100) || 'gerar mais clientes qualificados';
      result.forcedResponse = `Claro! ${offerShort}. Basicamente ajudamos empresas a crescer de forma profissional. Faz sentido conversar mais sobre como isso funcionaria pra você?`;
    }
    
    console.log('[DETERMINISTIC] Wants more info → Block handoff, require value');
    return result;
  }

  // 🆕 REGRA 2: Handoff só com pedido explícito de reunião E valor entregue
  if (wantsMeeting) {
    if (valueDelivered || currentOrder >= 3) {
      result.shouldHandoff = true;
      result.handoffReason = 'Lead pediu reunião/preço explicitamente';
      console.log('[DETERMINISTIC] Wants meeting + value delivered → Allow handoff');
    } else {
      // Não entregou valor ainda, explicar antes do handoff
      result.blockHandoff = true;
      result.blockReason = 'Precisa entregar valor antes de handoff';
      result.requireValue = true;
      console.log('[DETERMINISTIC] Wants meeting but no value → Block, deliver value first');
    }
    return result;
  }

  // 🆕 REGRA 3: Primeiro contato NUNCA faz handoff
  if (currentOrder === 1 && history.length <= 2) {
    result.blockHandoff = true;
    result.blockReason = 'Primeiro contato - não fazer handoff';
    console.log('[DETERMINISTIC] First contact → Block handoff');
  }

  return result;
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

    // 🆕 CAMADA 1: Normalizar stage_id
    const currentStage = normalizeStageId(current_stage_id);
    const currentOrder = CRM_STAGES[currentStage]?.order || 1;
    
    console.log('[AI] Stage normalized:', current_stage_id, '→', currentStage, '(order:', currentOrder, ')');

    const { data: conversationData } = await supabase
      .from('whatsapp_conversations')
      .select('messages_in_current_stage')
      .eq('id', conversation_id)
      .single();
    
    const dbMessagesInStage = conversationData?.messages_in_current_stage || 0;

    const cleanedMessage = cleanIncomingMessage(incoming_message);
    console.log('[AI] Incoming message cleaned:', cleanedMessage.substring(0, 100));

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

    const personaFirstName = aiConfig.persona_name?.split(' ')[0] || 'SDR';
    console.log('[AI] Using OpenAI API - Persona:', personaFirstName);

    // Se já está em STAGE_6+ (negociação/fechado), não responder
    if (currentOrder >= 6) {
      console.log('[AI] Lead já em negociação ou fechado, vendedor deve atender');
      return new Response(
        JSON.stringify({ 
          error: 'Lead in seller stage', 
          should_respond: false,
          handoff: true,
          message: 'Lead já está com vendedor, IA não responde'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE "SOU BOT?" - Resposta Humana ==========
    if (detectAmIBot(cleanedMessage)) {
      console.log('[AI] Lead asked if I am a bot - responding as human');
      const humanResponse = `Sou o ${personaFirstName}, da equipe de marketing! 😊 Me conta, como estão as coisas aí?`;
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: humanResponse,
          detected_intent: 'AM_I_BOT_QUESTION',
          confidence_score: 0.95,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: humanResponse,
          stage: currentStage,
          stage_normalized: currentStage,
          label_id: CRM_STAGES[currentStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
          deterministic_action: 'AM_I_BOT'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE "QUEM É VOCÊ?" - Pitch Direto ==========
    if (detectWhoAreYou(cleanedMessage)) {
      console.log('[AI] Lead asked who we are - giving value pitch');
      const targetAudience = aiConfig.target_audience || '';
      const offerSummary = targetAudience.toLowerCase().includes('venda') 
        ? 'estruturar marketing e aumentar vendas'
        : targetAudience.toLowerCase().includes('marketing')
        ? 'gerar demanda e escalar resultados' 
        : 'crescer no digital de forma profissional';

      const whoPitch = `Sou ${personaFirstName}! Trabalho ajudando empresas a ${offerSummary}. Vi seu trabalho e achei que poderia ser interessante conversar. Com o que você trabalha?`;
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: whoPitch,
          detected_intent: 'WHO_ARE_YOU_QUESTION',
          confidence_score: 0.95,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: whoPitch,
          stage: currentStage,
          stage_normalized: currentStage,
          label_id: CRM_STAGES[currentStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
          deterministic_action: 'WHO_ARE_YOU'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE REJEIÇÃO ==========
    const rejectionCheck = detectRejection(cleanedMessage);
    if (rejectionCheck.isRejection) {
      console.log('[AI] Rejection detected! Type:', rejectionCheck.type);
      
      let rejectionResponse: string;
      
      if (rejectionCheck.type === 'hard') {
        rejectionResponse = 'Entendido! Você não receberá mais mensagens. Se mudar de ideia, é só chamar. 👋';
        
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
        rejectionResponse = 'Sem problemas! Fico à disposição se precisar de algo. 😊';
      }
      
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: true,
          ai_handoff_reason: `Lead recusou: ${rejectionCheck.type}`,
          funnel_stage: 'lost'
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
          stage: 'STAGE_8',
          stage_normalized: 'STAGE_8',
          label_id: 'lost',
          is_rejection: true,
          rejection_type: rejectionCheck.type,
          should_handoff: false,
          ai_paused: true,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
          deterministic_action: 'REJECTION'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== DETECÇÃO DE BOT E EMPRESA ==========
    const botCheck = detectBotMessage(cleanedMessage);
    const isRoleInverted = detectRoleInversion(cleanedMessage);
    const businessAutoCheck = detectBusinessAutoResponse(cleanedMessage);
    const consecutiveAIResponses = countConsecutiveAIResponses(conversation_history || []);
    const consecutiveAIQuestions = countConsecutiveAIQuestions(conversation_history || []);
    const consecutiveColdResponses = countConsecutiveColdResponses(conversation_history || []);
    const isColdResponse = detectColdResponse(cleanedMessage);
    const wantsMoreInfo = detectWantsMoreInfo(cleanedMessage);
    const wantsMeeting = detectWantsMeeting(cleanedMessage);
    
    // 🆕 CAMADA 2: Extrair contexto incluindo valueDelivered
    const answeredTopics = extractAnsweredTopics(conversation_history || []);
    
    console.log('[AI] Detection results:', {
      bot: botCheck.isBot,
      roleInverted: isRoleInverted,
      businessAuto: businessAutoCheck.isBusinessAuto,
      consecutiveAI: consecutiveAIResponses,
      aiQuestions: consecutiveAIQuestions,
      coldResponses: consecutiveColdResponses,
      wantsInfo: wantsMoreInfo,
      wantsMeeting: wantsMeeting,
      valueDelivered: answeredTopics.valueDelivered
    });

    // 🆕 CAMADA 2: Decisões determinísticas
    const deterministicDecision = makeDeterministicDecisions(
      cleanedMessage,
      conversation_history || [],
      currentOrder,
      wantsMoreInfo,
      wantsMeeting,
      answeredTopics.valueDelivered,
      personaFirstName,
      aiConfig.offer_description || ''
    );

    // Se tem resposta forçada, usar ela diretamente
    if (deterministicDecision.forcedResponse) {
      console.log('[AI] Using deterministic forced response');
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: deterministicDecision.forcedResponse,
          detected_intent: 'DETERMINISTIC_VALUE_RESPONSE',
          confidence_score: 0.98,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: deterministicDecision.forcedResponse,
          stage: currentStage,
          stage_normalized: currentStage,
          label_id: CRM_STAGES[currentStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
          deterministic_action: 'FORCED_VALUE_RESPONSE',
          value_delivered: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // FAIL FAST: Se 2+ respostas frias consecutivas → dar pitch direto
    if (consecutiveColdResponses >= 2 || (isColdResponse && consecutiveAIQuestions >= 2)) {
      console.log('[AI] FAIL FAST: Lead is cold, giving direct pitch');
      const offerShort = aiConfig.offer_description?.substring(0, 60) || 'gerar mais clientes';
      const directPitch = `Olha, sem enrolação: ajudo empresas a ${offerShort}. Faz sentido falar mais sobre isso?`;
      
      await supabase
        .from('whatsapp_ai_logs')
        .insert({
          conversation_id,
          incoming_message: cleanedMessage,
          ai_response: directPitch,
          detected_intent: 'FAIL_FAST_COLD_LEAD',
          confidence_score: 0.9,
          needs_human: false
        });
      
      return new Response(
        JSON.stringify({
          response: directPitch,
          stage: currentStage,
          stage_normalized: currentStage,
          label_id: CRM_STAGES[currentStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
          deterministic_action: 'FAIL_FAST'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Loop de bot
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
          consecutive_ai_responses: consecutiveAIResponses,
          deterministic_action: 'BOT_LOOP_PAUSE'
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
          stage: currentStage,
          stage_normalized: currentStage,
          label_id: CRM_STAGES[currentStage]?.id || 'new',
          is_bot_message: true,
          bot_reason: botCheck.reason,
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 5,
          deterministic_action: 'BOT_DETECTED'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== BUSCAR PROMPT DA FASE ==========
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

    const messagesInStage = dbMessagesInStage > 0 ? dbMessagesInStage : countMessagesInCurrentStage(conversation_history || [], currentOrder);
    const defaultMaxMessages = currentOrder === 1 ? 2 : currentOrder <= 3 ? 3 : 4;
    const maxMessagesInStage = stagePrompt?.max_messages_in_stage || defaultMaxMessages;
    
    console.log('[AI] Messages in stage:', messagesInStage, '/', maxMessagesInStage);

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

    const businessContextKnown = !!answeredTopics.businessContext;
    console.log('[AI] Answered topics:', JSON.stringify(answeredTopics), '| Business context known:', businessContextKnown);
    
    let antiRepetitionContext = '';
    if (answeredTopics.urgencyAnswered || answeredTopics.painAnswered || answeredTopics.businessContext) {
      antiRepetitionContext = `
⚠️ INFORMAÇÕES JÁ COLETADAS (NÃO PERGUNTE DE NOVO):
${answeredTopics.urgencyAnswered ? '- ✅ URGÊNCIA: Lead JÁ disse que é urgente' : ''}
${answeredTopics.painAnswered ? '- ✅ DOR/PROBLEMA: Lead JÁ explicou sua dor' : ''}
${answeredTopics.businessContext ? `- ✅ CONTEXTO: "${answeredTopics.businessContext}"` : ''}
`;
    }
    
    const antiHallucinationRule = !businessContextKnown ? `
🚨 REGRA ANTI-ALUCINAÇÃO:
- Você NÃO sabe o negócio do lead
- NÃO INVENTE exemplos específicos
- Use termos GENÉRICOS: "seu negócio", "sua empresa"
- PERGUNTE ao invés de presumir
` : '';

    const valueBeforeQuestionsRule = consecutiveAIQuestions >= 2 ? `
🚨 REGRA OBRIGATÓRIA - VALOR ANTES DE PERGUNTA:
Você já fez ${consecutiveAIQuestions} perguntas seguidas sem dar valor.
NESTA MENSAGEM você DEVE:
- DAR VALOR primeiro: explique como você pode ajudar
- SÓ DEPOIS faça uma pergunta (opcional)

Exemplo: "Ajudamos empresas a conseguir mais clientes qualificados. Isso faz sentido pra você?"
` : '';

    const videoUrl = aiConfig.video_url;
    const siteUrl = aiConfig.site_url;
    const paymentLink = aiConfig.payment_link;

    // 🆕 CAMADA 3: Anti-alucinação de materiais ESTRITA
    const materialsAvailabilityRule = `
🎬 MATERIAIS DISPONÍVEIS:
${videoUrl ? `✅ TEM VÍDEO (${videoUrl.substring(0, 30)}...) - pode usar should_send_video: true` : `❌ NÃO TEM VÍDEO - NUNCA mencione vídeo, NUNCA use should_send_video: true`}
${siteUrl ? `✅ TEM SITE (${siteUrl.substring(0, 30)}...) - pode usar should_send_site: true` : `❌ NÃO TEM SITE - NUNCA mencione site, NUNCA use should_send_site: true`}
⚠️ REGRA ABSOLUTA: Só mencione materiais que existem!`;

    // 🆕 CAMADA 2: Regras de handoff determinísticas para o LLM
    const deterministicHandoffRule = deterministicDecision.blockHandoff ? `
🚫 HANDOFF BLOQUEADO:
Motivo: ${deterministicDecision.blockReason}
VOCÊ NÃO PODE usar should_handoff: true nesta resposta!
${deterministicDecision.requireValue ? 'Foque em ENTREGAR VALOR ao lead.' : ''}
` : (deterministicDecision.shouldHandoff ? `
✅ HANDOFF PERMITIDO:
Lead pediu reunião/preço explicitamente.
Você PODE usar should_handoff: true se fizer sentido.
` : `
📋 REGRAS DE HANDOFF (should_handoff: true):
✅ PERMITIDO apenas se:
- Lead EXPLICITAMENTE pediu reunião/call: "quero agendar", "vamos conversar"
- OU lead perguntou preço: "quanto custa", "qual o valor"
- E você JÁ explicou o que faz (não é a primeira interação)

❌ PROIBIDO fazer handoff se:
- Lead apenas disse "quero saber mais" (ele quer INFO, não reunião!)
- Lead ainda não entendeu a proposta
- Você não explicou como pode ajudar`);
    
    const roleInversionContext = isRoleInverted 
      ? `\n\n⚠️ O lead perguntou "em que posso ajudar" - ELE É ATENDENTE. APRESENTE-SE explicando quem você é e por que está entrando em contato.`
      : '';
    
    const antiMimicryRule = businessAutoCheck.isBusinessAuto ? `
🚨 REGRA ANTI-MIMETIZAÇÃO:
O lead é uma EMPRESA com atendimento automatizado.
❌ NÃO responda perguntas sobre pedidos, modelos, cores
❌ NÃO imite o roteiro dele
✅ Apresente-se: "Sou ${personaFirstName}, trabalho com marketing digital."
✅ Pergunte sobre os DESAFIOS de vendas DELES
` : '';

    const coldOutreachContext = currentOrder === 1 ? `
📞 CONTEXTO COLD OUTREACH (PRIMEIRO CONTATO):
Você enviou uma mensagem fria. O lead respondeu. Ele NÃO sabe quem você é.

REGRA DE OURO: DAR ANTES DE PEDIR
1. Explique brevemente quem você é
2. Mencione um benefício genérico
3. Faça UMA pergunta simples

EXEMPLO BOM:
Lead: "Opa" → "Olá! Sou ${personaFirstName}, ajudo empresas a crescer no digital. Com o que você trabalha?"

❌ NUNCA: Fazer mais de 1 pergunta por mensagem
❌ NUNCA: Perguntar nome antes de explicar quem você é
` : '';
    
    const shouldIncludeBusinessContext = currentOrder >= 2;
    
    const minimalContext = `
IDENTIDADE:
- Primeiro nome: ${personaFirstName}
- Área: marketing/negócios
- Tom: profissional e respeitoso

SAUDAÇÃO:
✅ Use: "Olá!", "Bom dia!", "Prazer!"
❌ NUNCA: "E aí", "Opa", "Eae", "Beleza"`;

    const fullBusinessContext = `
IDENTIDADE:
- Persona: ${aiConfig.persona_name || 'Assistente de Vendas'}
- Tom: ${aiConfig.tone || 'profissional'}
- Público: ${aiConfig.target_audience || 'não especificado'}

OFERTA:
${aiConfig.offer_description || 'Não especificada'}

URLs:
${videoUrl ? `- Vídeo: ${videoUrl}` : '- Vídeo: NÃO DISPONÍVEL'}
${siteUrl ? `- Site: ${siteUrl}` : '- Site: NÃO DISPONÍVEL'}`;

    const businessContext = shouldIncludeBusinessContext ? fullBusinessContext : minimalContext;

    // 🆕 CAMADA 4: Limite de caracteres ajustado
    const maxResponseChars = 350;
    
    let systemPromptForPhase: string;
    
    if (stagePrompt) {
      systemPromptForPhase = `${stagePrompt.system_prompt}

${businessContext}
${coldOutreachContext}
${antiRepetitionContext}
${antiHallucinationRule}
${antiMimicryRule}
${valueBeforeQuestionsRule}
${materialsAvailabilityRule}
${deterministicHandoffRule}

CONTEXTO:
- Nome do lead: ${lead_name || 'não identificado'}
- Fase: ${stagePrompt.stage_name} (${currentStage})
- Objetivo: ${stagePrompt.objective}
- Mensagens na fase: ${messagesInStage}/${maxMessagesInStage}
- Perguntas consecutivas: ${consecutiveAIQuestions}
- Respostas frias: ${consecutiveColdResponses}
- Valor já entregue: ${answeredTopics.valueDelivered ? 'SIM' : 'NÃO'}
${forceAdvance ? '- ⚠️ LIMITE ATINGIDO: Avance ou encerre!' : ''}
${roleInversionContext}`;
    } else {
      systemPromptForPhase = `${aiConfig.system_prompt}

${businessContext}
${coldOutreachContext}
${antiRepetitionContext}
${antiHallucinationRule}
${antiMimicryRule}
${valueBeforeQuestionsRule}
${materialsAvailabilityRule}
${deterministicHandoffRule}

CONTEXTO:
- Nome: ${lead_name || 'não identificado'}
- Fase: ${CRM_STAGES[currentStage]?.name || 'Lead Novo'}
- Mensagens: ${messagesInStage}
- Valor já entregue: ${answeredTopics.valueDelivered ? 'SIM' : 'NÃO'}
${roleInversionContext}`;
    }
    
    const fullPrompt = `
${systemPromptForPhase}

RESPONDA EM JSON:
{
  "response": "sua resposta (MÁXIMO ${maxResponseChars} caracteres)",
  "achieved_objective": true/false,
  "should_advance": true/false,
  "next_stage": "STAGE_1" a "STAGE_5",
  "lead_name": "nome ou null",
  "should_send_video": true/false,
  "should_send_site": true/false,
  "should_handoff": true/false,
  "handoff_reason": "motivo curto"
}

ESTÁGIOS:
- STAGE_1: Lead Novo - Gerar curiosidade, descobrir área/cargo
- STAGE_2: Levantamento - Descobrir dor, contexto, urgência
- STAGE_3: Apresentação - Mostrar solução, entregar valor
- STAGE_4: Interesse Confirmado - Confirmar interesse, coletar dados
- STAGE_5: Handoff - Passar para vendedor

REGRAS CRÍTICAS:
1. Resposta CURTA (máximo ${maxResponseChars} caracteres)
2. UMA pergunta por mensagem no máximo
3. Se fez 2+ perguntas, DÊ VALOR antes de perguntar de novo
4. Avance apenas 1 estágio por vez
5. NUNCA vá além de STAGE_5
6. ${!videoUrl ? 'NÃO mencione vídeo (não existe!)' : ''}
7. ${!siteUrl ? 'NÃO mencione site (não existe!)' : ''}

Histórico:
${historyMessages.slice(-6).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última: "${cleanedMessage}"
`;

    console.log('[AI] Calling OpenAI API - Stage:', currentStage, '| Persona:', personaFirstName);

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
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI] OpenAI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', should_respond: false }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`OpenAI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[AI] OpenAI response:', aiContent.substring(0, 200));

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiContent);
    } catch {
      console.log('[AI] Failed to parse response, using fallback');
      const fallbackResponse = currentOrder === 1 
        ? `Olá! Sou ${personaFirstName}, trabalho com marketing digital. Com quem falo? 😊`
        : 'Me conta mais sobre seu negócio? 😊';
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

    // 🆕 CAMADA 2: Aplicar decisões determinísticas sobre a resposta do LLM
    if (deterministicDecision.blockHandoff && parsedResponse.should_handoff) {
      console.log('[AI] DETERMINISTIC OVERRIDE: Blocking handoff -', deterministicDecision.blockReason);
      parsedResponse.should_handoff = false;
      parsedResponse.handoff_reason = null;
    }

    if (deterministicDecision.shouldHandoff && !parsedResponse.should_handoff) {
      console.log('[AI] DETERMINISTIC OVERRIDE: Forcing handoff -', deterministicDecision.handoffReason);
      parsedResponse.should_handoff = true;
      parsedResponse.handoff_reason = deterministicDecision.handoffReason;
    }

    // 🆕 CAMADA 3: Bloquear materiais inexistentes
    if (!videoUrl && parsedResponse.should_send_video) {
      console.log('[AI] ANTI-HALLUCINATION: Blocking video flag (no video configured)');
      parsedResponse.should_send_video = false;
    }
    if (!siteUrl && parsedResponse.should_send_site) {
      console.log('[AI] ANTI-HALLUCINATION: Blocking site flag (no site configured)');
      parsedResponse.should_send_site = false;
    }

    // Garantir mensagem de handoff
    if (parsedResponse.should_handoff) {
      const response = parsedResponse.response?.toLowerCase() || '';
      const hasHandoffMessage = response.includes('consultor') || 
                                response.includes('especialista') || 
                                response.includes('transferir') ||
                                response.includes('entrar em contato');
      
      if (!hasHandoffMessage) {
        console.log('[AI] Handoff without proper message, adding farewell');
        const leadNameForHandoff = parsedResponse.lead_name || lead_name;
        parsedResponse.response = leadNameForHandoff 
          ? `Perfeito, ${leadNameForHandoff}! Vou te passar para nosso consultor. Ele vai entrar em contato em instantes! 🤝`
          : `Perfeito! Vou te passar para nosso consultor. Ele vai entrar em contato em instantes! 🤝`;
      }
    }

    let finalStage = parsedResponse.next_stage || currentStage;
    
    // Normalizar finalStage também
    finalStage = normalizeStageId(finalStage);
    
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

    if (!parsedResponse.should_handoff && finalOrder > currentOrder + 1) {
      const nextStage = Object.entries(CRM_STAGES).find(([, info]) => info.order === currentOrder + 1);
      if (nextStage) {
        finalStage = nextStage[0] as CRMStage;
      }
    }

    if (parsedResponse.should_handoff) {
      finalStage = 'STAGE_5';
    }

    const finalOrderCheck = CRM_STAGES[finalStage as CRMStage]?.order || 1;
    if (finalOrderCheck > 5) {
      finalStage = 'STAGE_5';
    }

    const labelId = CRM_STAGES[finalStage as CRMStage]?.id || 'new';
    const shouldSendVideo = parsedResponse.should_send_video && !!videoUrl;
    const shouldSendSite = parsedResponse.should_send_site && !!siteUrl;
    const needsHuman = parsedResponse.should_handoff || finalStage === 'STAGE_5';

    // Atualizar conversation
    const stageChanged = finalStage !== currentStage;
    
    if (!stageChanged) {
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          funnel_stage: labelId,
          messages_in_current_stage: messagesInStage + 1,
          name: parsedResponse.lead_name || lead_name || undefined,
          ai_paused: needsHuman,
          ai_handoff_reason: needsHuman ? (parsedResponse.handoff_reason || 'Interesse confirmado') : undefined
        })
        .eq('id', conversation_id);
    } else {
      console.log('[AI] Stage transition:', currentStage, '->', finalStage, '| labelId:', labelId);
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          funnel_stage: labelId,
          messages_in_current_stage: 0,
          name: parsedResponse.lead_name || lead_name || undefined,
          ai_paused: needsHuman,
          ai_handoff_reason: needsHuman ? (parsedResponse.handoff_reason || 'Interesse confirmado') : undefined
        })
        .eq('id', conversation_id);
    }

    await supabase
      .from('whatsapp_ai_logs')
      .insert({
        conversation_id,
        incoming_message: cleanedMessage,
        ai_response: parsedResponse.response,
        detected_intent: `${finalStage} | Obj: ${parsedResponse.achieved_objective} | Adv: ${parsedResponse.should_advance} | ValDel: ${answeredTopics.valueDelivered}`,
        applied_label_id: labelId,
        confidence_score: 0.9,
        needs_human: needsHuman
      });

    console.log('[AI] Response ready - Stage:', finalStage, '| Handoff:', needsHuman, '| Label:', labelId);

    return new Response(
      JSON.stringify({
        response: parsedResponse.response,
        stage: finalStage,
        stage_normalized: finalStage,
        label_id: labelId,
        lead_name: parsedResponse.lead_name || lead_name || null,
        achieved_objective: parsedResponse.achieved_objective,
        should_advance: parsedResponse.should_advance,
        stage_changed: stageChanged,
        should_send_video: shouldSendVideo,
        should_send_site: shouldSendSite,
        should_handoff: needsHuman,
        handoff_reason: parsedResponse.handoff_reason || null,
        needs_human: needsHuman,
        video_url: shouldSendVideo ? videoUrl : null,
        site_url: shouldSendSite ? siteUrl : null,
        payment_link: paymentLink || null,
        delay_seconds: aiConfig.auto_reply_delay_seconds || 2,
        // 🆕 Debug info adicional
        deterministic_decision: {
          blockHandoff: deterministicDecision.blockHandoff,
          blockReason: deterministicDecision.blockReason,
          shouldHandoff: deterministicDecision.shouldHandoff,
          handoffReason: deterministicDecision.handoffReason
        },
        value_delivered: answeredTopics.valueDelivered
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AI] Error in whatsapp-ai-agent:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

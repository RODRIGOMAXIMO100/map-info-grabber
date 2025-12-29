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
  // Novos padrões para cold outreach
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

// 🆕 Detecta se lead pergunta "você é bot?"
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

// 🆕 Detecta se lead pergunta "quem é você?"
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

// 🆕 Detecta respostas frias/monossilábicas
function detectColdResponse(message: string): boolean {
  const normalizedMsg = message.toLowerCase().trim();
  // Resposta muito curta (< 10 chars) e não é uma palavra de contexto
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

// 🆕 Conta perguntas consecutivas da IA (para regra "valor antes de perguntas")
function countConsecutiveAIQuestions(history: Array<{ direction: string; content: string }>): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.direction === 'outgoing') {
      // Detectar se é pergunta (termina com ?)
      if (msg.content?.trim().endsWith('?')) {
        count++;
      } else {
        break; // Encontrou mensagem que não é pergunta
      }
    } else {
      // Encontrou mensagem do lead
      break;
    }
  }
  return count;
}

// 🆕 Conta respostas frias consecutivas do lead
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { conversation_id, incoming_message, conversation_history, current_stage_id, lead_name } = await req.json();

    if (!conversation_id || !incoming_message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and incoming_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    console.log('[AI] Using Lovable AI (Gemini) - Persona:', personaFirstName);

    const currentStage = current_stage_id ? getStageFromLabelId(current_stage_id) : 'STAGE_1';
    const currentOrder = currentStage ? CRM_STAGES[currentStage as CRMStage]?.order || 1 : 1;

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

    // ========== 🆕 DETECÇÃO DE "SOU BOT?" - Resposta Humana ==========
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
          stage: currentStage || 'STAGE_1',
          label_id: CRM_STAGES[currentStage as CRMStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== 🆕 DETECÇÃO DE "QUEM É VOCÊ?" - Pitch Direto ==========
    if (detectWhoAreYou(cleanedMessage)) {
      console.log('[AI] Lead asked who we are - giving value pitch');
      const offerShort = aiConfig.offer_description?.substring(0, 80) || 'crescer no digital';
      const whoPitch = `Sou ${personaFirstName}! Ajudo empresas a ${offerShort}. Vi seu trabalho e achei que poderia ser útil pra você. Com o que você trabalha?`;
      
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
          stage: currentStage || 'STAGE_1',
          label_id: CRM_STAGES[currentStage as CRMStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2
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
          label_id: 'lost',
          is_rejection: true,
          rejection_type: rejectionCheck.type,
          should_handoff: false,
          ai_paused: true,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2
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
    
    console.log('[AI] Bot:', botCheck.isBot, '| Role inverted:', isRoleInverted, '| Business auto:', businessAutoCheck.isBusinessAuto, '| Consecutive AI:', consecutiveAIResponses, '| AI Questions:', consecutiveAIQuestions, '| Cold responses:', consecutiveColdResponses);

    // 🆕 FAIL FAST: Se 2+ respostas frias consecutivas → dar pitch direto
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
          stage: currentStage || 'STAGE_1',
          label_id: CRM_STAGES[currentStage as CRMStage]?.id || 'new',
          should_send_video: false,
          should_send_site: false,
          should_handoff: false,
          delay_seconds: aiConfig.auto_reply_delay_seconds || 2
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
          label_id: CRM_STAGES[currentStage as CRMStage]?.id || 'new',
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
    // 🆕 LIMITES REDUZIDOS: STAGE_1=2, STAGE_2=3, STAGE_3=3
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

    const answeredTopics = extractAnsweredTopics(conversation_history || []);
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

    // 🆕 REGRA "VALOR ANTES DE PERGUNTAS"
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

    // 🆕 COLD OUTREACH CONTEXT - STAGE_1 é diferente
    const coldOutreachContext = currentOrder === 1 ? `
📞 CONTEXTO COLD OUTREACH (PRIMEIRO CONTATO):
Você enviou uma mensagem fria. O lead respondeu. Ele NÃO sabe quem você é.

REGRA DE OURO: DAR ANTES DE PEDIR
1. Explique brevemente quem você é
2. Mencione um benefício genérico
3. Faça UMA pergunta simples

EXEMPLO BOM:
Lead: "Opa" → "Fala! Sou ${personaFirstName}, ajudo empresas a crescer pelo digital. Com o que você trabalha?"

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
${videoUrl ? `- Vídeo: ${videoUrl}` : ''}
${siteUrl ? `- Site: ${siteUrl}` : ''}`;

    const businessContext = shouldIncludeBusinessContext ? fullBusinessContext : minimalContext;
    
    let systemPromptForPhase: string;
    
    if (stagePrompt) {
      systemPromptForPhase = `${stagePrompt.system_prompt}

${businessContext}
${coldOutreachContext}
${antiRepetitionContext}
${antiHallucinationRule}
${antiMimicryRule}
${valueBeforeQuestionsRule}

CONTEXTO:
- Nome do lead: ${lead_name || 'não identificado'}
- Fase: ${stagePrompt.stage_name} (${currentStage})
- Objetivo: ${stagePrompt.objective}
- Mensagens na fase: ${messagesInStage}/${maxMessagesInStage}
- Perguntas consecutivas: ${consecutiveAIQuestions}
- Respostas frias: ${consecutiveColdResponses}
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

CONTEXTO:
- Nome: ${lead_name || 'não identificado'}
- Fase: ${CRM_STAGES[currentStage as CRMStage]?.name || 'Lead Novo'}
- Mensagens: ${messagesInStage}
${roleInversionContext}`;
    }
    
    const fullPrompt = `
${systemPromptForPhase}

RESPONDA EM JSON:
{
  "response": "sua resposta (MÁXIMO 200 caracteres)",
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
- STAGE_3: Apresentação - Mostrar solução, enviar vídeo
- STAGE_4: Interesse Confirmado - Confirmar interesse, coletar dados
- STAGE_5: Handoff - Passar para vendedor

REGRAS CRÍTICAS:
1. Resposta CURTA (máximo 200 caracteres)
2. UMA pergunta por mensagem no máximo
3. Se fez 2+ perguntas, DÊ VALOR antes de perguntar de novo
4. Avance apenas 1 estágio por vez
5. NUNCA vá além de STAGE_5

Histórico:
${historyMessages.slice(-6).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última: "${cleanedMessage}"
`;

    console.log('[AI] Calling Lovable AI (Gemini) - Stage:', currentStage, '| Persona:', personaFirstName);

    // 🆕 USANDO LOVABLE AI GATEWAY (Gemini)
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: fullPrompt },
          ...historyMessages.slice(-6)
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[AI] Lovable AI error:', aiResponse.status, errorText);
      
      // Handle rate limits
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded', should_respond: false }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted', should_respond: false }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Lovable AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('[AI] Lovable AI response:', aiContent.substring(0, 200));

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
    if (finalStage === currentStage) {
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
        detected_intent: `${finalStage} | Obj: ${parsedResponse.achieved_objective} | Adv: ${parsedResponse.should_advance}`,
        applied_label_id: labelId,
        confidence_score: 0.9,
        needs_human: needsHuman
      });

    console.log('[AI] Response ready - Stage:', finalStage, '| Handoff:', needsHuman, '| Label:', labelId);

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
        delay_seconds: aiConfig.auto_reply_delay_seconds || 2
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

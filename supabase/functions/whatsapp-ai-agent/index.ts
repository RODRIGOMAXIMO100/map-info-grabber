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

// ========== DETECÇÃO DE REJEIÇÃO (NOVO!) ==========
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

// NOVO: Detectar rejeição do lead
function detectRejection(message: string): { isRejection: boolean; type: 'hard' | 'soft' | null } {
  const normalizedMsg = message.toLowerCase().trim();
  
  // Hard rejection - não insistir de jeito nenhum
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
  
  // Soft rejection - pode tentar nurturing depois
  for (const pattern of REJECTION_PATTERNS) {
    if (pattern.test(normalizedMsg)) {
      console.log('[AI] Soft rejection detected:', pattern.toString());
      return { isRejection: true, type: 'soft' };
    }
  }
  
  return { isRejection: false, type: null };
}

// Limpar mensagens do WhatsApp (ex: buttonsMessage JSON)
function cleanIncomingMessage(raw: string): string {
  if (!raw) return '';
  
  // Se é JSON do WhatsApp (buttonsMessage, etc), extrair texto
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

// Contar mensagens consecutivas da IA na fase atual
function countMessagesInCurrentStage(
  history: Array<{ direction: string; content: string }>,
  currentStageOrder: number
): number {
  // Simplificação: contar mensagens outgoing recentes
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'outgoing') {
      count++;
    } else {
      break; // Para quando encontrar incoming
    }
  }
  return count;
}

// Conta respostas consecutivas da IA sem resposta humana real
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
    const { conversation_id, incoming_message, conversation_history, current_stage_id, dna_id, lead_name } = await req.json();

    if (!conversation_id || !incoming_message) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and incoming_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar mensagem de entrada (ex: JSONs do WhatsApp)
    const cleanedMessage = cleanIncomingMessage(incoming_message);
    console.log('[AI] Incoming message cleaned:', cleanedMessage.substring(0, 100));

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

    const currentStage = current_stage_id ? getStageFromLabelId(current_stage_id) : 'STAGE_1';
    const currentOrder = currentStage ? CRM_STAGES[currentStage as CRMStage]?.order || 1 : 1;

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

    // ========== DETECÇÃO DE REJEIÇÃO (NOVO!) ==========
    const rejectionCheck = detectRejection(cleanedMessage);
    if (rejectionCheck.isRejection) {
      console.log('[AI] Rejection detected! Type:', rejectionCheck.type);
      
      let rejectionResponse: string;
      let newStage: string;
      
      if (rejectionCheck.type === 'hard') {
        // Rejeição dura - blacklist e encerrar
        rejectionResponse = 'Entendido! Você não receberá mais mensagens. Se mudar de ideia, é só chamar. 👋';
        newStage = 'STAGE_7'; // Fechado/Perdido
        
        // Adicionar à blacklist
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
        // Rejeição suave - nurturing
        rejectionResponse = 'Sem problemas! Fico à disposição se precisar de algo no futuro. 😊';
        newStage = 'STAGE_7'; // Marcar como perdido por agora
      }
      
      // Pausar IA para este lead
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          ai_paused: true,
          ai_handoff_reason: `Lead recusou: ${rejectionCheck.type}`,
          funnel_stage: newStage === 'STAGE_7' ? 'lost' : 'nurturing'
        })
        .eq('id', conversation_id);
      
      // Log
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

    // Se muitas respostas consecutivas da IA (possível loop com bot), pausar
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

    // Se é mensagem de bot, responder de forma simples
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

    // ========== BUSCAR PROMPT ESPECÍFICO DA FASE (NOVO!) ==========
    // Primeiro tenta encontrar prompt para DNA + stage, depois genérico para stage
    let stagePrompt = null;
    
    if (dnaIdToUse) {
      const { data: dnaStagePrompt } = await supabase
        .from('ai_stage_prompts')
        .select('*')
        .eq('stage_id', currentStage)
        .eq('dna_id', dnaIdToUse)
        .eq('is_active', true)
        .maybeSingle();
      
      if (dnaStagePrompt) {
        stagePrompt = dnaStagePrompt;
        console.log('[AI] Using DNA-specific stage prompt for', currentStage);
      }
    }
    
    // Fallback para prompt genérico da fase
    if (!stagePrompt) {
      const { data: genericStagePrompt } = await supabase
        .from('ai_stage_prompts')
        .select('*')
        .eq('stage_id', currentStage)
        .is('dna_id', null)
        .eq('is_active', true)
        .maybeSingle();
      
      if (genericStagePrompt) {
        stagePrompt = genericStagePrompt;
        console.log('[AI] Using generic stage prompt for', currentStage);
      }
    }

    // Contar mensagens nesta fase
    const messagesInStage = countMessagesInCurrentStage(conversation_history || [], currentOrder);
    const maxMessagesInStage = stagePrompt?.max_messages_in_stage || 5;
    
    console.log('[AI] Messages in stage:', messagesInStage, '/', maxMessagesInStage);

    // Se excedeu limite de mensagens na fase, forçar avanço
    const forceAdvance = messagesInStage >= maxMessagesInStage;
    if (forceAdvance) {
      console.log('[AI] Max messages in stage reached, will force advance');
    }

    // Build conversation history (últimas 10 mensagens apenas)
    const recentHistory = (conversation_history || []).slice(-10);
    const historyMessages = recentHistory.map((msg: { direction: string; content: string }) => ({
      role: msg.direction === 'incoming' ? 'user' : 'assistant',
      content: cleanIncomingMessage(msg.content || '')
    }));
    historyMessages.push({ role: 'user', content: cleanedMessage });

    // Determine URLs from DNA or config
    const videoUrl = dnaConfig?.video_url || aiConfig.video_url;
    const siteUrl = dnaConfig?.site_url || aiConfig.site_url;
    const paymentLink = dnaConfig?.payment_link || aiConfig.payment_link;
    
    // Contexto de inversão de papéis
    const roleInversionContext = isRoleInverted 
      ? `\n\n⚠️ ATENÇÃO: O lead perguntou "em que posso ajudar" - ELE É UM ATENDENTE. 
         APRESENTE-SE explicando quem você é e por que está entrando em contato. NÃO pergunte o nome.`
      : '';
    
    // ========== CONSTRUIR PROMPT FOCADO NA FASE (NOVO!) ==========
    let systemPromptForPhase: string;
    
    if (stagePrompt) {
      // Usar prompt específico da fase
      systemPromptForPhase = `${stagePrompt.system_prompt}

CONTEXTO ADICIONAL:
- Nome do lead: ${lead_name || 'não identificado'}
- Você está na fase: ${stagePrompt.stage_name} (${currentStage})
- Objetivo: ${stagePrompt.objective}
- Critério de sucesso: ${stagePrompt.success_criteria || 'N/A'}
- Mensagens nesta fase: ${messagesInStage}/${maxMessagesInStage}
${forceAdvance ? '- ⚠️ LIMITE ATINGIDO: Tente avançar ou fazer handoff nesta mensagem!' : ''}

URLs disponíveis:
- Vídeo: ${videoUrl || 'não configurado'}
- Site: ${siteUrl || 'não configurado'}
${paymentLink ? `- Link de Pagamento: ${paymentLink}` : ''}
${roleInversionContext}`;
    } else {
      // Fallback para prompt legado do DNA ou config
      const legacyPrompt = dnaConfig?.system_prompt || aiConfig.system_prompt;
      systemPromptForPhase = `${legacyPrompt}

CONTEXTO:
- Nome do lead: ${lead_name || 'não identificado'}
- Fase atual: ${CRM_STAGES[currentStage as CRMStage]?.name || 'Lead Novo'} (${currentStage})
- Mensagens nesta fase: ${messagesInStage}
${roleInversionContext}

URLs disponíveis:
- Vídeo: ${videoUrl || 'não configurado'}
- Site: ${siteUrl || 'não configurado'}
${paymentLink ? `- Link de Pagamento: ${paymentLink}` : ''}`;
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

REGRAS CRÍTICAS:
1. Resposta CURTA (máximo 250 caracteres)
2. Avance APENAS 1 estágio por vez
3. Se should_handoff=true, next_stage deve ser STAGE_5
4. should_advance só é true se o objetivo da fase foi alcançado
5. Use o nome do lead sempre que souber

Histórico recente:
${historyMessages.slice(-6).map((m: { role: string; content: string }) => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`).join('\n')}

Última mensagem: "${cleanedMessage}"
`;

    console.log('[AI] Calling OpenAI - Stage:', currentStage, 'Order:', currentOrder, 'DNA:', dnaConfig?.name || 'default', 'StagePrompt:', !!stagePrompt);

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
      parsedResponse = {
        response: 'Olá! Como posso ajudar? 😊',
        achieved_objective: false,
        should_advance: false,
        next_stage: currentStage,
        should_send_video: false,
        should_send_site: false,
        should_handoff: false
      };
    }

    // Determinar próximo estágio
    let finalStage = parsedResponse.next_stage || currentStage;
    
    // Se forçar avanço e não está avançando, forçar
    if (forceAdvance && !parsedResponse.should_advance && currentOrder < 5) {
      const nextOrder = Math.min(currentOrder + 1, 5);
      const nextStageEntry = Object.entries(CRM_STAGES).find(([, info]) => info.order === nextOrder);
      if (nextStageEntry) {
        finalStage = nextStageEntry[0] as CRMStage;
        console.log('[AI] Force advancing to:', finalStage);
      }
    }
    
    // Prevent stage regression
    const finalOrder = CRM_STAGES[finalStage as CRMStage]?.order || 1;
    if (currentOrder > finalOrder) {
      finalStage = currentStage;
    }

    // Não avançar mais que 1 estágio por mensagem (exceto handoff)
    if (!parsedResponse.should_handoff && finalOrder > currentOrder + 1) {
      const nextStage = Object.entries(CRM_STAGES).find(([, info]) => info.order === currentOrder + 1);
      if (nextStage) {
        finalStage = nextStage[0] as CRMStage;
      }
    }

    // Se should_handoff, forçar STAGE_5
    if (parsedResponse.should_handoff) {
      finalStage = 'STAGE_5';
    }

    const labelId = CRM_STAGES[finalStage as CRMStage]?.id || '16';
    const shouldSendVideo = parsedResponse.should_send_video && !!videoUrl;
    const shouldSendSite = parsedResponse.should_send_site && !!siteUrl;
    const needsHuman = parsedResponse.should_handoff || finalStage === 'STAGE_5';

    // Atualizar contador de mensagens na fase
    if (finalStage === currentStage) {
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          messages_in_current_stage: messagesInStage + 1,
          name: parsedResponse.lead_name || lead_name || undefined
        })
        .eq('id', conversation_id);
    } else {
      // Mudou de fase, resetar contador
      await supabase
        .from('whatsapp_conversations')
        .update({ 
          messages_in_current_stage: 0,
          name: parsedResponse.lead_name || lead_name || undefined
        })
        .eq('id', conversation_id);
    }

    // Log AI decision
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

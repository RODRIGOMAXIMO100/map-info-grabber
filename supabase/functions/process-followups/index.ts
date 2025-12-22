import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mensagens de follow-up por estágio
const FOLLOWUP_MESSAGES = {
  // Lead novo - não respondeu ao disparo inicial
  STAGE_1: [
    "Oi! Vi que ainda não tivemos a chance de conversar 😊 Sou da VIJAY, especialistas em ajudar indústrias a vender mais. Posso te contar como funciona?",
    "Olá! Passando pra ver se conseguimos conversar. Temos uma metodologia que já ajudou dezenas de indústrias a estruturar o comercial. Tem interesse em conhecer?",
    "Oi! Última tentativa de contato 🙂 Se tiver interesse em melhorar os resultados comerciais da sua indústria, é só responder aqui!"
  ],
  // MQL - respondeu mas parou
  STAGE_2: [
    "Oi {{nome}}! Continuando nossa conversa... você tinha demonstrado interesse na consultoria comercial. Posso te explicar melhor como funciona?",
    "{{nome}}, ainda pensando sobre a consultoria? Posso te mostrar alguns cases de indústrias que ajudamos 📊",
    "{{nome}}, última mensagem sobre isso. Se quiser retomar a conversa sobre estruturação comercial, é só me chamar!"
  ],
  // Engajado - estava qualificando mas parou
  STAGE_3: [
    "{{nome}}, tudo bem? Estávamos conversando sobre os desafios do comercial de vocês. Quer continuar de onde paramos?",
    "Oi {{nome}}! Lembrei da nossa conversa. Conseguiu avaliar internamente sobre a consultoria comercial?",
    "{{nome}}, vi que ficamos sem nos falar. Se fizer sentido agendar uma call com nosso consultor, é só me avisar!"
  ],
  // SQL - pronto mas não agendou
  STAGE_4: [
    "{{nome}}, nosso consultor está com agenda essa semana. Quer que eu reserve um horário pra vocês conversarem?",
    "Oi {{nome}}! Só passando pra lembrar que estamos à disposição pra agendar a call de diagnóstico. Qual melhor dia pra você?",
    "{{nome}}, última lembrança sobre o agendamento. Se quiser conversar com nosso consultor, me avisa que organizo!"
  ]
};

// Configurações de follow-up
const FOLLOWUP_CONFIG = {
  hoursBeforeFirstFollowup: 24,  // Espera 24h após última mensagem do lead
  hoursBetweenFollowups: 48,     // Espera 48h entre follow-ups
  maxFollowups: 3,               // Máximo de 3 follow-ups
  workingHoursStart: 9,          // Começa às 9h
  workingHoursEnd: 18,           // Termina às 18h
  workingDays: [1, 2, 3, 4, 5]   // Segunda a Sexta (0=Dom, 6=Sab)
};

function isWorkingHours(): boolean {
  const now = new Date();
  const hour = now.getUTCHours() - 3; // Ajuste para horário de Brasília (UTC-3)
  const dayOfWeek = now.getUTCDay();
  
  return FOLLOWUP_CONFIG.workingDays.includes(dayOfWeek) && 
         hour >= FOLLOWUP_CONFIG.workingHoursStart && 
         hour < FOLLOWUP_CONFIG.workingHoursEnd;
}

function getFollowupMessage(stage: string, followupCount: number, leadName: string | null): string {
  const stageMessages = FOLLOWUP_MESSAGES[stage as keyof typeof FOLLOWUP_MESSAGES] || FOLLOWUP_MESSAGES.STAGE_1;
  const messageIndex = Math.min(followupCount, stageMessages.length - 1);
  let message = stageMessages[messageIndex];
  
  // Substitui {{nome}} pelo nome do lead ou remove se não tiver nome
  if (leadName) {
    message = message.replace(/\{\{nome\}\}/g, leadName);
  } else {
    message = message.replace(/\{\{nome\}\},?\s*/g, '');
    message = message.replace(/\s+/g, ' ').trim();
  }
  
  return message;
}

function getCurrentStage(tags: string[] | null): string {
  if (!tags || tags.length === 0) return 'STAGE_1';
  
  // Procura por tags de estágio
  for (const tag of tags) {
    if (tag.startsWith('STAGE_')) {
      return tag;
    }
  }
  return 'STAGE_1';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Follow-up] Starting follow-up processing...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verifica se está em horário comercial
    if (!isWorkingHours()) {
      console.log('[Follow-up] Outside working hours, skipping...');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Outside working hours',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verifica se o agente IA está ativo
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_config')
      .select('is_active')
      .limit(1)
      .single();

    if (!aiConfig?.is_active) {
      console.log('[Follow-up] AI agent is not active, skipping...');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'AI agent not active',
        processed: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Busca configuração do WhatsApp
    const { data: whatsappConfig } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!whatsappConfig) {
      console.log('[Follow-up] WhatsApp not configured');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'WhatsApp not configured' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calcula o tempo de corte para follow-up
    const now = new Date();
    const firstFollowupCutoff = new Date(now.getTime() - (FOLLOWUP_CONFIG.hoursBeforeFirstFollowup * 60 * 60 * 1000));
    const subsequentFollowupCutoff = new Date(now.getTime() - (FOLLOWUP_CONFIG.hoursBetweenFollowups * 60 * 60 * 1000));

    // Busca conversas que precisam de follow-up
    const { data: conversations, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('id, phone, name, tags, followup_count, last_followup_at, last_lead_message_at, last_message_at, ai_paused')
      .eq('status', 'active')
      .eq('ai_paused', false)
      .lt('followup_count', FOLLOWUP_CONFIG.maxFollowups)
      .not('tags', 'cs', '{"STAGE_5"}') // Não fazer follow-up em leads já em handoff
      .not('tags', 'cs', '{"NURTURING"}') // Não fazer follow-up em nurturing
      .order('last_message_at', { ascending: true })
      .limit(10);

    if (convError) {
      console.error('[Follow-up] Error fetching conversations:', convError);
      throw convError;
    }

    console.log(`[Follow-up] Found ${conversations?.length || 0} potential conversations`);

    let processedCount = 0;
    const results: any[] = [];

    for (const conv of conversations || []) {
      try {
        // Verifica a última mensagem para ver se foi do lead ou nossa
        const { data: lastMessage } = await supabase
          .from('whatsapp_messages')
          .select('direction, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Se a última mensagem foi do lead, não precisa de follow-up
        if (lastMessage?.direction === 'incoming') {
          console.log(`[Follow-up] Skipping ${conv.phone} - last message was from lead`);
          continue;
        }

        // Determina se é hora de fazer follow-up
        const lastContactTime = conv.last_lead_message_at || conv.last_message_at;
        const lastFollowupTime = conv.last_followup_at;
        
        let shouldFollowup = false;
        
        if (conv.followup_count === 0) {
          // Primeiro follow-up: espera hoursBeforeFirstFollowup desde a última mensagem
          shouldFollowup = new Date(lastContactTime) < firstFollowupCutoff;
        } else {
          // Follow-ups subsequentes: espera hoursBetweenFollowups desde o último follow-up
          shouldFollowup = lastFollowupTime && new Date(lastFollowupTime) < subsequentFollowupCutoff;
        }

        if (!shouldFollowup) {
          console.log(`[Follow-up] Skipping ${conv.phone} - not time for follow-up yet`);
          continue;
        }

        // Determina o estágio atual e a mensagem de follow-up
        const currentStage = getCurrentStage(conv.tags);
        const message = getFollowupMessage(currentStage, conv.followup_count, conv.name);

        console.log(`[Follow-up] Sending to ${conv.phone} (${currentStage}, followup #${conv.followup_count + 1}): ${message.substring(0, 50)}...`);

        // Envia a mensagem via WhatsApp
        const sendUrl = `${whatsappConfig.server_url}/message/sendText/${whatsappConfig.instance_phone}`;
        const sendResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': whatsappConfig.instance_token
          },
          body: JSON.stringify({
            number: conv.phone,
            text: message
          })
        });

        if (!sendResponse.ok) {
          const errorText = await sendResponse.text();
          console.error(`[Follow-up] Failed to send to ${conv.phone}:`, errorText);
          continue;
        }

        // Atualiza a conversa
        const newFollowupCount = (conv.followup_count || 0) + 1;
        const updateData: any = {
          followup_count: newFollowupCount,
          last_followup_at: now.toISOString(),
          updated_at: now.toISOString()
        };

        // Se atingiu o máximo de follow-ups, move para nurturing
        if (newFollowupCount >= FOLLOWUP_CONFIG.maxFollowups) {
          const currentTags = conv.tags || [];
          updateData.tags = [...currentTags.filter((t: string) => !t.startsWith('STAGE_')), 'NURTURING'];
          console.log(`[Follow-up] Moving ${conv.phone} to NURTURING after ${newFollowupCount} follow-ups`);
        }

        await supabase
          .from('whatsapp_conversations')
          .update(updateData)
          .eq('id', conv.id);

        // Salva a mensagem no histórico
        await supabase
          .from('whatsapp_messages')
          .insert({
            conversation_id: conv.id,
            content: message,
            direction: 'outgoing',
            message_type: 'text',
            status: 'sent'
          });

        processedCount++;
        results.push({
          phone: conv.phone,
          stage: currentStage,
          followupNumber: newFollowupCount,
          message: message.substring(0, 50) + '...'
        });

        // Pequeno delay entre envios para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (convError) {
        console.error(`[Follow-up] Error processing ${conv.phone}:`, convError);
      }
    }

    console.log(`[Follow-up] Completed. Processed ${processedCount} follow-ups`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: processedCount,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Follow-up] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

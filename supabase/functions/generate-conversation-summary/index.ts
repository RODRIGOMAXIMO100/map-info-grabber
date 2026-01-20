import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STAGE_NAMES: Record<string, string> = {
  'new': 'Lead Novo',
  'presentation': 'Apresentação Feita',
  'interest': 'Interesse Confirmado',
  'negotiating': 'Negociando',
  'handoff': 'Handoff - Vendedor',
  'converted': 'Convertido',
  'lost': 'Perdido',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversation_id } = await req.json();

    if (!conversation_id) {
      return new Response(
        JSON.stringify({ error: 'conversation_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.error('[Summary] OPENAI_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch conversation details
    const { data: conversation, error: convError } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .eq('id', conversation_id)
      .single();

    if (convError || !conversation) {
      console.error('[Summary] Conversation not found:', convError);
      return new Response(
        JSON.stringify({ error: 'Conversation not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch last 50 messages for more context
    const { data: messages, error: msgError } = await supabase
      .from('whatsapp_messages')
      .select('direction, content, message_type, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (msgError) {
      console.error('[Summary] Error fetching messages:', msgError);
      return new Response(
        JSON.stringify({ error: 'Error fetching messages' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch AI logs for context
    const { data: aiLogs } = await supabase
      .from('whatsapp_ai_logs')
      .select('detected_intent, bant_score, ai_response, incoming_message')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Format messages for AI (reverse to chronological order)
    const formattedMessages = (messages || [])
      .reverse()
      .map(m => {
        const role = m.direction === 'incoming' ? 'LEAD' : 'SDR/IA';
        const content = m.content || `[${m.message_type}]`;
        return `${role}: ${content}`;
      })
      .join('\n');

    // Extract BANT and intent info
    const latestBant = aiLogs?.find(l => l.bant_score)?.bant_score || {};
    const latestIntent = aiLogs?.find(l => l.detected_intent)?.detected_intent || 'desconhecido';
    const stageName = STAGE_NAMES[conversation.funnel_stage] || conversation.funnel_stage;

    const systemPrompt = `Você é um assistente que cria resumos completos de conversas de vendas para vendedores.

Seu resumo DEVE ter 5-7 frases estruturadas cobrindo:

1. **Perfil do Lead**: Quem é, o que faz, contexto do negócio
2. **Histórico**: Como chegou até aqui, pontos principais discutidos
3. **Interesse/Necessidade**: O que o lead precisa ou quer resolver
4. **Objeções/Dúvidas**: Pontos de resistência ou perguntas levantadas
5. **Próximo Passo**: Recomendação clara e acionável para o vendedor

REGRAS:
- Seja informativo mas objetivo
- Use linguagem profissional de vendas
- Inclua detalhes relevantes mencionados na conversa (empresa, setor, dores)
- Destaque sinais de compra ou alertas importantes
- Termine sempre com uma ação concreta para o vendedor`;

    const userPrompt = `CONTEXTO:
- Lead: ${conversation.name || conversation.phone}
- Estágio atual: ${stageName}
- Intent detectado: ${latestIntent}
- BANT: Budget=${latestBant.budget || '?'}, Authority=${latestBant.authority || '?'}, Need=${latestBant.need || '?'}, Timing=${latestBant.timing || '?'}
${conversation.estimated_value ? `- Valor estimado: R$ ${conversation.estimated_value}` : ''}
${conversation.ai_handoff_reason ? `- Motivo handoff: ${conversation.ai_handoff_reason}` : ''}

HISTÓRICO DA CONVERSA (${messages?.length || 0} mensagens):
${formattedMessages || 'Nenhuma mensagem encontrada'}

Gere um resumo completo de 5-7 frases para o vendedor:`;

    console.log('[Summary] Calling OpenAI for conversation:', conversation_id);

    // Call OpenAI API
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Summary] AI API error:', aiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'AI service error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      console.error('[Summary] No summary generated');
      return new Response(
        JSON.stringify({ error: 'Failed to generate summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Summary] Generated summary:', summary);

    // Save summary to database
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        conversation_summary: summary,
        summary_updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id);

    if (updateError) {
      console.error('[Summary] Error saving summary:', updateError);
      return new Response(
        JSON.stringify({ error: 'Error saving summary' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        summary,
        updated_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Summary] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

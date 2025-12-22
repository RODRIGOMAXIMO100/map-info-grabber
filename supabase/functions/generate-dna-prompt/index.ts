import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { persona_name, target_audience, offer_description, tone, video_url, site_url, payment_link } = await req.json();

    if (!persona_name || !target_audience || !offer_description) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: persona_name, target_audience, offer_description' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const toneDescriptions: Record<string, string> = {
      'profissional': 'formal, corporativo e respeitoso, mantendo sempre um tom de negócios',
      'descontraido': 'amigável, leve e próximo, usando linguagem do dia-a-dia',
      'tecnico': 'especialista e detalhista, demonstrando conhecimento profundo do assunto',
      'consultivo': 'orientado a soluções, fazendo perguntas para entender necessidades',
    };

    const toneDescription = toneDescriptions[tone] || toneDescriptions['profissional'];

    const materialsSection = [];
    if (video_url) materialsSection.push(`- Vídeo de apresentação: ${video_url}`);
    if (site_url) materialsSection.push(`- Site/Landing page: ${site_url}`);
    if (payment_link) materialsSection.push(`- Link de pagamento: ${payment_link}`);

    const metaPrompt = `Você é um especialista em criar prompts para agentes de IA de vendas (SDR - Sales Development Representative).

Crie um prompt de sistema completo e profissional para um agente SDR com as seguintes características:

PERSONA: ${persona_name}
PÚBLICO-ALVO: ${target_audience}
OFERTA: ${offer_description}
TOM DE VOZ: ${toneDescription}
${materialsSection.length > 0 ? `\nMATERIAIS DISPONÍVEIS:\n${materialsSection.join('\n')}` : ''}

O prompt deve incluir:

1. **IDENTIDADE**: Quem é o agente, nome e empresa
2. **PAPEL DO SDR**: Explicar que é qualificador, não vendedor
3. **OBJETIVO**: Qualificar leads e movê-los pelo funil
4. **CRITÉRIOS BANT**: 
   - Budget (orçamento)
   - Authority (autoridade de decisão)
   - Need (necessidade)
   - Timing (urgência)
5. **FUNIL DE VENDAS** com 6 etapas:
   - STAGE_1: Primeiro contato
   - STAGE_2: Qualificação inicial
   - STAGE_3: Interesse confirmado
   - STAGE_4: Qualificado para venda
   - STAGE_5: Handoff para humano
   - STAGE_6: Conversão/Fechamento
6. **REGRAS DE COMPORTAMENTO**:
   - Nunca inventar informações
   - Nunca discutir preços exatos
   - Respostas curtas (max 400 caracteres)
   - Uso moderado de emojis
7. **QUANDO ENVIAR MATERIAIS**: Regras para enviar vídeo, site e link de pagamento
8. **TOM E ESTILO**: Baseado no tom definido

Escreva o prompt em português brasileiro, formatado em markdown com seções claras.
NÃO inclua explicações, apenas o prompt final.`;

    console.log('Generating DNA prompt with OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um especialista em criar prompts para agentes de IA de vendas. Responda apenas com o prompt, sem explicações adicionais.' },
          { role: 'user', content: metaPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const generatedPrompt = data.choices[0].message.content;

    console.log('Prompt generated successfully');

    return new Response(
      JSON.stringify({ prompt: generatedPrompt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating prompt:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar prompt';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

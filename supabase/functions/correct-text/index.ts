const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();

    if (!text || text.length < 5) {
      return new Response(JSON.stringify({ corrected: text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-nano',
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content: 'Você é um corretor ortográfico e gramatical. Corrija erros de ortografia e gramática no texto. Retorne APENAS o texto corrigido, sem explicações, sem aspas, sem prefixos. Mantenha emojis, formatação e pontuação. Se o texto já estiver correto, retorne-o exatamente como está.'
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim() || text;

    return new Response(JSON.stringify({ corrected }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error correcting text:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ corrected: null, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

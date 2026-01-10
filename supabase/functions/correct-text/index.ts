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
        model: 'google/gemini-2.5-flash-lite',
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Você é um corretor ortográfico e gramatical de português brasileiro.

REGRAS:
1. Corrija erros de ortografia (ex: "voce" → "você", "nao" → "não", "oq" → "o que")
2. Corrija erros de gramática e pontuação
3. Adicione acentos faltando
4. Mantenha emojis e formatação original
5. Retorne APENAS o texto corrigido, sem explicações

Se o texto já estiver perfeito, retorne-o exatamente igual.`
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('AI Gateway error:', response.status, errorBody);
      return new Response(JSON.stringify({ corrected: text, error: `Gateway error: ${response.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const corrected = data.choices?.[0]?.message?.content?.trim() || text;
    
    console.log('Original:', text);
    console.log('Corrected:', corrected);

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

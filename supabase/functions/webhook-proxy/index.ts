import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL do webhook principal neste mesmo projeto
const WEBHOOK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-receive-webhook`;

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[Proxy] ========================================');
  console.log('[Proxy] Received webhook from UAZAPI');
  console.log('[Proxy] Method:', req.method);
  console.log('[Proxy] URL:', req.url);

  try {
    // Ler o body JSON do UAZAPI
    const bodyText = await req.text();
    console.log('[Proxy] Body length:', bodyText.length);
    console.log('[Proxy] Body preview:', bodyText.substring(0, 500));

    if (!bodyText || bodyText.length === 0) {
      console.log('[Proxy] WARNING: Empty body received!');
      return new Response(JSON.stringify({ error: 'Empty body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fazer PROXY (não redirect!) para o webhook principal
    console.log('[Proxy] Forwarding to:', WEBHOOK_URL);
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: bodyText, // Passa o body JSON completo!
    });

    const responseText = await response.text();
    console.log('[Proxy] Webhook response status:', response.status);
    console.log('[Proxy] Webhook response:', responseText.substring(0, 200));

    // Retornar a mesma resposta que o webhook retornou
    return new Response(responseText, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Proxy] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

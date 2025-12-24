import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Location {
  city: string;
  state: string;
}

interface SearchRequest {
  keyword: string;
  locations: Location[];
  maxResults?: number;
}

// Check if a phone number is a mobile number
function isMobileNumber(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) return digits[4] === '9';
  if (digits.length === 11) return digits[2] === '9';
  return false;
}

// Extract WhatsApp link from phone
function extractWhatsApp(phone: string | null): string {
  if (!phone || !isMobileNumber(phone)) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = '55' + digits;
  return `https://wa.me/${digits}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, locations, maxResults = 20 }: SearchRequest = await req.json();

    if (!keyword || !locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'keyword and locations are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
    if (!SERPAPI_KEY) {
      console.error('SERPAPI_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SERPAPI_KEY not configured', errorCode: 'NO_API_KEY' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: any[] = [];

    for (const location of locations) {
      const query = `${keyword} em ${location.city}, ${location.state}`;
      console.log(`[SerpAPI] Searching: ${query}`);

      const params = new URLSearchParams({
        engine: 'google_maps',
        q: query,
        hl: 'pt-br',
        gl: 'br',
        type: 'search',
        api_key: SERPAPI_KEY,
      });

      const response = await fetch(`https://serpapi.com/search.json?${params}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[SerpAPI] API error for ${location.city}:`, response.status, errorText);
        
        // Handle 401/403 - Auth issues
        if (response.status === 401 || response.status === 403) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'SerpAPI sem créditos ou chave inválida.',
              errorCode: 'NO_CREDITS',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Handle 429 - Rate limit
        if (response.status === 429) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Limite de requisições SerpAPI atingido.',
              errorCode: 'RATE_LIMIT',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        continue;
      }

      const data = await response.json();
      
      // Check for API errors in response
      if (data.error) {
        console.error(`[SerpAPI] Response error:`, data.error);
        if (data.error.includes('credit') || data.error.includes('quota')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'SerpAPI sem créditos disponíveis.',
              errorCode: 'NO_CREDITS',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        continue;
      }

      const places = data.local_results || [];
      
      console.log(`[SerpAPI] Found ${places.length} results for ${location.city}`);

      for (const result of places.slice(0, maxResults)) {
        const phone = result.phone || '';
        const whatsapp = extractWhatsApp(phone);

        allResults.push({
          name: result.title || '',
          address: result.address || '',
          phone: phone,
          website: result.website || '',
          whatsapp: whatsapp,
          instagram: '', // SerpAPI doesn't provide this directly
          email: '', // SerpAPI doesn't provide this directly
          city: location.city,
          state: location.state,
          rating: result.rating || null,
          reviews: result.reviews || 0,
          source: 'google_maps',
          place_id: result.place_id || '',
          category: result.type || '',
          thumbnail: result.thumbnail || '',
        });
      }
    }

    console.log(`[SerpAPI] Total results: ${allResults.length}`);

    return new Response(
      JSON.stringify({ success: true, data: allResults, apiUsed: 'serpapi' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[SerpAPI] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

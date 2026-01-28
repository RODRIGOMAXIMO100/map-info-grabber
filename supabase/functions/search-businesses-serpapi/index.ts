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

// Extract WhatsApp link from phone (includes landlines - WhatsApp Business supports them)
function extractWhatsApp(phone: string | null): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  
  // Minimum length: DDD (2) + number (8) = 10 digits
  if (digits.length < 10) return '';
  
  // Add Brazil country code if not present
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  // Final validation: 12-13 digits for Brazil (55 + DDD + 8-9 digit number)
  if (digits.length < 12 || digits.length > 13) return '';
  
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

    // Try SERPAPI_KEY first (for backwards compatibility), then SERPER_API_KEY
    const SERPER_KEY = Deno.env.get('SERPAPI_KEY') || Deno.env.get('SERPER_API_KEY');
    if (!SERPER_KEY) {
      console.error('SERPER API KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SERPER_API_KEY not configured', errorCode: 'NO_API_KEY' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: any[] = [];

    for (const location of locations) {
      const query = `${keyword} em ${location.city}, ${location.state}`;
      console.log(`[Serper] Searching: ${query}`);

      // Create abort controller with 15s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      let response: Response;
      try {
        response = await fetch('https://google.serper.dev/places', {
          method: 'POST',
          headers: {
            'X-API-KEY': SERPER_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            gl: 'br',
            hl: 'pt-br',
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
      } catch (err) {
        clearTimeout(timeout);
        console.error(`[Serper] Timeout/error for ${location.city}:`, err);
        continue; // Skip this city, try next
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Serper] API error for ${location.city}:`, response.status, errorText);
        
        // Handle 401/403 - Auth issues
        if (response.status === 401 || response.status === 403) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Serper sem créditos ou chave inválida.',
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
              error: 'Limite de requisições Serper atingido.',
              errorCode: 'RATE_LIMIT',
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Handle 500+ - Server errors, skip to next city
        if (response.status >= 500) {
          console.error(`[Serper] Server error for ${location.city}, skipping`);
          continue;
        }
        
        continue;
      }

      const data = await response.json();
      
      // Check for API errors in response
      if (data.error) {
        console.error(`[Serper] Response error:`, data.error);
        continue;
      }

      const places = data.places || [];
      
      console.log(`[Serper] Found ${places.length} results for ${location.city}`);

      for (const result of places.slice(0, maxResults)) {
        const phone = result.phoneNumber || '';
        const whatsapp = extractWhatsApp(phone);

        allResults.push({
          name: result.title || '',
          address: result.address || '',
          phone: phone,
          website: result.website || '',
          whatsapp: whatsapp,
          instagram: '', // Serper doesn't provide this directly
          email: '', // Serper doesn't provide this directly
          city: location.city,
          state: location.state,
          rating: result.rating || null,
          reviews: result.reviewsCount || result.reviews || 0,
          source: 'google_maps',
          place_id: result.placeId || result.cid || '',
          category: result.category || result.type || '',
          thumbnail: result.thumbnailUrl || '',
        });
      }
    }

    console.log(`[Serper] Total results: ${allResults.length}`);

    return new Response(
      JSON.stringify({ success: true, data: allResults, apiUsed: 'serper' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Serper] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

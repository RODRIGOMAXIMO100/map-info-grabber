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
}

function extractWhatsApp(phone: string, website: string, links: any[]): string {
  // Check if website is a WhatsApp link
  if (website && website.includes('wa.me')) {
    return website;
  }
  
  // Check in links array
  if (links && Array.isArray(links)) {
    for (const link of links) {
      if (link.link?.includes('wa.me')) {
        return link.link;
      }
    }
  }
  
  // Generate WhatsApp link from phone number (Brazilian format)
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
      const fullNumber = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
      return `https://wa.me/${fullNumber}`;
    }
  }
  
  return '';
}

function extractInstagram(website: string, links: any[]): string {
  // Check if website is Instagram
  if (website && website.includes('instagram.com')) {
    return website;
  }
  
  // Check in links array
  if (links && Array.isArray(links)) {
    for (const link of links) {
      if (link.link?.includes('instagram.com')) {
        return link.link;
      }
    }
  }
  
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, locations } = await req.json() as SearchRequest;
    const serpApiKey = Deno.env.get('SERPAPI_KEY');

    if (!serpApiKey) {
      console.error('SERPAPI_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!keyword || !locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Palavra-chave e pelo menos uma localização são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching for "${keyword}" in ${locations.length} locations`);

    const allResults: any[] = [];

    for (const location of locations) {
      const query = `${keyword} em ${location.city}, ${location.state}`;
      console.log(`Searching: ${query}`);

      const params = new URLSearchParams({
        engine: 'google_maps',
        q: query,
        type: 'search',
        api_key: serpApiKey,
        hl: 'pt-br',
        gl: 'br',
      });

      const response = await fetch(`https://serpapi.com/search?${params}`);
      const data = await response.json();

      if (data.error) {
        console.error(`SerpAPI error for ${location.city}: ${data.error}`);
        continue;
      }

      const localResults = data.local_results || [];
      console.log(`Found ${localResults.length} results for ${location.city}`);

      for (const result of localResults) {
        const phone = result.phone || '';
        const website = result.website || '';
        const links = result.links || [];
        
        const whatsapp = extractWhatsApp(phone, website, links);
        const instagram = extractInstagram(website, links);
        
        console.log(`Business: ${result.title}, Phone: ${phone}, WhatsApp: ${whatsapp}, Instagram: ${instagram}`);

        allResults.push({
          name: result.title || '',
          address: result.address || '',
          phone: phone,
          website: website,
          rating: result.rating || null,
          reviews: result.reviews || null,
          city: location.city,
          state: location.state,
          place_id: result.place_id || '',
          whatsapp: whatsapp,
          instagram: instagram,
        });
      }
    }

    console.log(`Total results: ${allResults.length}`);

    return new Response(
      JSON.stringify({ success: true, data: allResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Search error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

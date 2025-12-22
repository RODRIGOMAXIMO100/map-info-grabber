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

// Verifica se é um número de celular válido (não telefone fixo)
function isMobileNumber(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Remove o código do país se existir
  let localNumber = cleanPhone;
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    localNumber = cleanPhone.slice(2);
  }
  
  // Número brasileiro: DDD (2 dígitos) + número (8-9 dígitos)
  // Celulares começam com 9 (ou 6-9 em alguns casos antigos)
  // Fixos começam com 2, 3, 4 ou 5
  
  if (localNumber.length < 10 || localNumber.length > 11) {
    return false;
  }
  
  // Pega o primeiro dígito após o DDD
  const firstDigit = localNumber.length === 11 ? localNumber[2] : localNumber[2];
  const hasNinePrefix = localNumber.length === 11; // Celulares têm 11 dígitos (DDD + 9 + 8 dígitos)
  
  // Celulares no Brasil:
  // - Têm 11 dígitos (com DDD): XX 9XXXX-XXXX
  // - O terceiro dígito (após DDD) é 9
  // Fixos:
  // - Têm 10 dígitos (com DDD): XX XXXX-XXXX  
  // - O terceiro dígito é 2, 3, 4 ou 5
  
  if (hasNinePrefix) {
    // 11 dígitos - deve começar com 9 após o DDD para ser celular
    const digitAfterDDD = localNumber[2];
    return digitAfterDDD === '9' || digitAfterDDD === '8' || digitAfterDDD === '7' || digitAfterDDD === '6';
  }
  
  // 10 dígitos - provavelmente fixo (formato antigo de celular era 10 dígitos, mas hoje são 11)
  // Vamos considerar fixo se começar com 2, 3, 4 ou 5
  const digitAfterDDD = localNumber[2];
  if (digitAfterDDD === '2' || digitAfterDDD === '3' || digitAfterDDD === '4' || digitAfterDDD === '5') {
    return false; // Telefone fixo
  }
  
  return true; // Provavelmente celular antigo
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
  // IMPORTANTE: Só gerar se for número de CELULAR (não fixo)
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
      // Verificar se é celular antes de gerar link
      if (!isMobileNumber(cleanPhone)) {
        console.log(`[Search] Skipping landline number: ${phone}`);
        return ''; // Telefone fixo - não gerar link WhatsApp
      }
      
      const fullNumber = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
      return `https://wa.me/${fullNumber}`;
    }
  }
  
  return '';
}

// Extrai o nome real do estabelecimento (parte depois do " - ")
function extractRealName(title: string): string {
  if (!title) return '';
  
  // Se tiver " - ", pega a parte DEPOIS (nome real do profissional/estabelecimento)
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts[1] && parts[1].trim().length > 3) {
      return parts[1].trim();
    }
  }
  
  // Se tiver " | ", pega a parte DEPOIS
  if (title.includes(' | ')) {
    const parts = title.split(' | ');
    if (parts[1] && parts[1].trim().length > 3) {
      return parts[1].trim();
    }
  }
  
  // Fallback: retorna o título original
  return title;
}

function extractInstagram(website: string, links: any[], result: any): string {
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
  
  // Check in social profiles (some results have this)
  if (result.social_links && Array.isArray(result.social_links)) {
    for (const social of result.social_links) {
      if (social.link?.includes('instagram.com')) {
        return social.link;
      }
    }
  }
  
  // Check in profiles array
  if (result.profiles && Array.isArray(result.profiles)) {
    for (const profile of result.profiles) {
      if (profile.link?.includes('instagram.com') || profile.url?.includes('instagram.com')) {
        return profile.link || profile.url;
      }
    }
  }
  
  // Check in place_info if available
  if (result.place_info?.instagram) {
    return result.place_info.instagram;
  }
  
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { keyword, locations, maxResults = 20 } = await req.json() as SearchRequest;
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

    // Calculate how many pages to fetch (each page has ~20 results)
    const pagesToFetch = Math.ceil(maxResults / 20);
    console.log(`Searching for "${keyword}" in ${locations.length} locations, maxResults: ${maxResults}, pages: ${pagesToFetch}`);

    const allResults: any[] = [];

    for (const location of locations) {
      const query = `${keyword} em ${location.city}, ${location.state}`;
      console.log(`Searching: ${query}`);

      let locationResults: any[] = [];

      for (let page = 0; page < pagesToFetch; page++) {
        // Stop if we already have enough results for this location
        if (locationResults.length >= maxResults) {
          console.log(`Reached maxResults (${maxResults}) for ${location.city}`);
          break;
        }

        const params = new URLSearchParams({
          engine: 'google_maps',
          q: query,
          type: 'search',
          api_key: serpApiKey,
          hl: 'pt-br',
          gl: 'br',
          start: String(page * 20),
        });

        console.log(`Fetching page ${page + 1} for ${location.city} (start: ${page * 20})`);
        const response = await fetch(`https://serpapi.com/search?${params}`);
        const data = await response.json();

        if (data.error) {
          console.error(`SerpAPI error for ${location.city} page ${page + 1}: ${data.error}`);
          break;
        }

        const pageResults = data.local_results || [];
        console.log(`Page ${page + 1}: Found ${pageResults.length} results for ${location.city}`);

        if (pageResults.length === 0) {
          console.log(`No more results for ${location.city} at page ${page + 1}`);
          break;
        }

        locationResults.push(...pageResults);
      }

      // Limit to maxResults per location
      locationResults = locationResults.slice(0, maxResults);
      console.log(`Total for ${location.city}: ${locationResults.length} results`);

      const localResults = locationResults;

      for (const result of localResults) {
        const phone = result.phone || '';
        const website = result.website || '';
        const links = result.links || [];
        
        const whatsapp = extractWhatsApp(phone, website, links);
        const instagram = extractInstagram(website, links, result);
        
        // Log detailed info for debugging Instagram detection
        if (!instagram && (result.links?.length > 0 || result.social_links || result.profiles)) {
          console.log(`[DEBUG] ${result.title} - links: ${JSON.stringify(result.links)}, social_links: ${JSON.stringify(result.social_links)}, profiles: ${JSON.stringify(result.profiles)}`);
        }
        
        console.log(`Business: ${result.title}, Phone: ${phone}, WhatsApp: ${whatsapp}, Instagram: ${instagram}`);

        allResults.push({
          name: extractRealName(result.title || ''),
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

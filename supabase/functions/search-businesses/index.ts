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

// Check if a phone number is a mobile number (starts with 9 after DDD)
function isMobileNumber(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  // Brazilian mobile: 55 + DDD(2) + 9 + number(8) = 13 digits
  // Or without country code: DDD(2) + 9 + number(8) = 11 digits
  if (digits.length === 13) {
    return digits[4] === '9';
  }
  if (digits.length === 11) {
    return digits[2] === '9';
  }
  return false;
}

// Extract WhatsApp link from phone or enriched data
function extractWhatsApp(phone: string | null, site: string | null): string {
  // First check if there's a wa.me link in the site
  if (site) {
    const waMatch = site.match(/wa\.me\/(\d+)/i);
    if (waMatch) {
      return `https://wa.me/${waMatch[1]}`;
    }
  }
  
  // If phone is mobile, create WhatsApp link
  if (phone && isMobileNumber(phone)) {
    let digits = phone.replace(/\D/g, '');
    // Add Brazil country code if not present
    if (!digits.startsWith('55')) {
      digits = '55' + digits;
    }
    return `https://wa.me/${digits}`;
  }
  
  return '';
}

// Extract Instagram from enriched data
function extractInstagram(result: any): string {
  // Outscraper provides Instagram directly in enrichment
  if (result.instagram) {
    const url = result.instagram;
    if (url.includes('instagram.com')) {
      return url;
    }
    return `https://instagram.com/${url.replace('@', '')}`;
  }
  
  // Check social_media array if available
  if (result.social_media && Array.isArray(result.social_media)) {
    for (const social of result.social_media) {
      if (typeof social === 'string' && social.includes('instagram.com')) {
        return social;
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
    const { keyword, locations, maxResults = 20 }: SearchRequest = await req.json();

    if (!keyword || !locations || locations.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'keyword and locations are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OUTSCRAPER_API_KEY = Deno.env.get('OUTSCRAPER_API_KEY');
    if (!OUTSCRAPER_API_KEY) {
      console.error('OUTSCRAPER_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'OUTSCRAPER_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: any[] = [];

    for (const location of locations) {
      const query = `${keyword} ${location.city}, ${location.state}, Brasil`;
      console.log(`[Outscraper] Searching: ${query}`);

      const params = new URLSearchParams({
        query: query,
        limit: String(maxResults),
        language: 'pt-BR',
        region: 'BR',
        async: 'false',
        dropDuplicates: 'true',
        enrichment: 'domains_service', // Get Instagram, email, social media
      });

      const response = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
        headers: {
          'X-API-KEY': OUTSCRAPER_API_KEY,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Outscraper] API error for ${location.city}:`, response.status, errorText);
        continue;
      }

      const data = await response.json();
      
      // Outscraper returns data in data array or directly
      const places = data.data?.[0] || data[0] || [];
      
      if (!Array.isArray(places)) {
        console.log(`[Outscraper] No results for ${location.city}`);
        continue;
      }

      console.log(`[Outscraper] Found ${places.length} results for ${location.city}`);

      for (const result of places) {
        const phone = result.phone || '';
        const site = result.site || result.website || '';
        const whatsapp = extractWhatsApp(phone, site);
        const instagram = extractInstagram(result);
        
        // Better category extraction - prioritize subtypes (more specific)
        const category = result.subtypes?.[0] || result.category || result.type || result.types?.[0] || '';

        allResults.push({
          name: result.name || '',
          address: result.full_address || result.address || '',
          phone: phone,
          website: site,
          whatsapp: whatsapp,
          instagram: instagram,
          email: result.email_1 || result.email || '',
          city: location.city,
          state: location.state,
          rating: result.rating || null,
          reviews: result.reviews || result.reviews_count || 0,
          source: 'google_maps',
          place_id: result.place_id || '',
          // Additional enriched data
          facebook: result.facebook || '',
          linkedin: result.linkedin || '',
          twitter: result.twitter || '',
          category: category,
        });
      }
    }

    console.log(`[Outscraper] Total results: ${allResults.length}`);

    return new Response(
      JSON.stringify({ success: true, data: allResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Outscraper] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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

interface InstagramResult {
  name: string;
  username: string;
  profileUrl: string;
  bio?: string;
  city: string;
  state: string;
  source: 'instagram';
  whatsapp?: string;
  instagram?: string;
  phone?: string;
  website?: string;
  email?: string;
  score: number;
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
  if (phone && isMobileNumber(phone)) {
    let digits = phone.replace(/\D/g, '');
    if (!digits.startsWith('55')) {
      digits = '55' + digits;
    }
    return `https://wa.me/${digits}`;
  }
  return '';
}

// Calculate score based on available contact info
function calculateScore(result: any): number {
  let score = 1;
  
  if (result.phone && isMobileNumber(result.phone)) {
    score = 5; // Mobile = likely WhatsApp
  } else if (result.phone) {
    score = 3; // Has phone
  } else if (result.email) {
    score = 2; // Has email
  }
  
  return score;
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

    const allResults: InstagramResult[] = [];

    for (const location of locations) {
      // Use Maps search with enrichment to get Instagram profiles
      const query = `${keyword} ${location.city}, ${location.state}, Brasil`;
      console.log(`[Outscraper Instagram] Searching: ${query}`);

      const params = new URLSearchParams({
        query: query,
        limit: String(maxResults),
        language: 'pt-BR',
        region: 'BR',
        async: 'false',
        dropDuplicates: 'true',
        enrichment: 'domains_service',
      });

      const response = await fetch(`https://api.app.outscraper.com/maps/search-v3?${params}`, {
        headers: {
          'X-API-KEY': OUTSCRAPER_API_KEY,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Outscraper Instagram] API error for ${location.city}:`, response.status, errorText);
        continue;
      }

      const data = await response.json();
      const places = data.data?.[0] || data[0] || [];
      
      if (!Array.isArray(places)) {
        console.log(`[Outscraper Instagram] No results for ${location.city}`);
        continue;
      }

      console.log(`[Outscraper Instagram] Found ${places.length} results for ${location.city}`);

      for (const result of places) {
        // Only include results that have Instagram
        const instagram = result.instagram || '';
        if (!instagram) continue;

        const instagramUrl = instagram.includes('instagram.com') 
          ? instagram 
          : `https://instagram.com/${instagram.replace('@', '')}`;
        
        // Extract username from URL
        const usernameMatch = instagramUrl.match(/instagram\.com\/([^\/\?]+)/);
        const username = usernameMatch ? usernameMatch[1] : instagram.replace('@', '');

        const phone = result.phone || '';
        const whatsapp = extractWhatsApp(phone);
        const score = calculateScore(result);

        allResults.push({
          name: result.name || username,
          username: username,
          profileUrl: instagramUrl,
          bio: result.description || result.about || '',
          city: location.city,
          state: location.state,
          source: 'instagram',
          whatsapp: whatsapp || undefined,
          instagram: instagramUrl,
          phone: phone || undefined,
          website: result.site || result.website || undefined,
          email: result.email_1 || result.email || undefined,
          score,
        });
      }
    }

    // Sort by score and remove duplicates
    const uniqueResults = allResults
      .sort((a, b) => b.score - a.score)
      .filter((item, index, self) => 
        index === self.findIndex(t => t.username === item.username)
      );

    console.log(`[Outscraper Instagram] Total unique profiles: ${uniqueResults.length}`);

    return new Response(
      JSON.stringify({ success: true, data: uniqueResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Outscraper Instagram] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

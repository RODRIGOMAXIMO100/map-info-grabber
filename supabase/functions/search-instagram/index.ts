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
  score: number;
}

// Extract WhatsApp from bio text
function extractWhatsAppFromText(text: string): string | null {
  if (!text) return null;
  
  // Look for wa.me links
  const waLinkMatch = text.match(/wa\.me\/(\d+)/i);
  if (waLinkMatch) {
    return `https://wa.me/${waLinkMatch[1]}`;
  }
  
  // Look for api.whatsapp.com links
  const apiMatch = text.match(/api\.whatsapp\.com\/send\?phone=(\d+)/i);
  if (apiMatch) {
    return `https://wa.me/${apiMatch[1]}`;
  }
  
  // Look for Brazilian phone patterns (with 9 digits = mobile = WhatsApp likely)
  const phonePatterns = [
    /\(?\d{2}\)?\s*9\s*\d{4}[-.\s]?\d{4}/g, // (11) 9 1234-5678
    /\d{2}\s*9\d{8}/g, // 11 912345678
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 11) {
        const formatted = digits.length === 10 ? `55${digits.slice(0,2)}9${digits.slice(2)}` : `55${digits}`;
        return `https://wa.me/${formatted}`;
      }
    }
  }
  
  return null;
}

// Extract phone from text
function extractPhoneFromText(text: string): string | null {
  if (!text) return null;
  
  const phonePatterns = [
    /\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g,
  ];
  
  for (const pattern of phonePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

// Calculate lead quality score
function calculateScore(result: any): number {
  let score = 1;
  
  // Check snippet for WhatsApp indicators
  const snippet = (result.snippet || '').toLowerCase();
  const title = (result.title || '').toLowerCase();
  const combined = snippet + ' ' + title;
  
  if (combined.includes('wa.me') || combined.includes('api.whatsapp')) {
    score = 5; // Confirmed WhatsApp link
  } else if (combined.includes('whatsapp') || combined.includes('zap')) {
    score = 4; // Mentions WhatsApp
  } else if (/\d{2}\s*9\d{4}/.test(combined)) {
    score = 3; // Has mobile number (9 digits)
  } else if (/\d{2}\s*\d{4}/.test(combined)) {
    score = 2; // Has phone number
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

    const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
    if (!SERPAPI_KEY) {
      console.error('SERPAPI_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SERPAPI_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allResults: InstagramResult[] = [];

    for (const location of locations) {
      // Build search query for Instagram profiles in this location
      const query = `site:instagram.com "${keyword}" "${location.city}" "${location.state}" (whatsapp OR zap OR telefone OR celular)`;
      
      console.log(`Searching Instagram: ${query}`);

      const params = new URLSearchParams({
        engine: 'google',
        q: query,
        api_key: SERPAPI_KEY,
        num: String(Math.min(maxResults, 100)),
        gl: 'br',
        hl: 'pt-br',
      });

      const response = await fetch(`https://serpapi.com/search.json?${params}`);
      
      if (!response.ok) {
        console.error(`SerpAPI error for ${location.city}:`, response.status);
        continue;
      }

      const data = await response.json();
      const organicResults = data.organic_results || [];

      for (const result of organicResults) {
        const link = result.link || '';
        
        // Only process Instagram profile links
        if (!link.includes('instagram.com/') || link.includes('/p/') || link.includes('/reel/')) {
          continue;
        }

        // Extract username from URL
        const usernameMatch = link.match(/instagram\.com\/([^\/\?]+)/);
        if (!usernameMatch) continue;
        
        const username = usernameMatch[1];
        
        // Skip common non-profile pages
        if (['explore', 'accounts', 'direct', 'stories', 'reels', 'tv'].includes(username)) {
          continue;
        }

        const snippet = result.snippet || '';
        const title = result.title || '';
        
        const whatsapp = extractWhatsAppFromText(snippet) || extractWhatsAppFromText(title);
        const phone = extractPhoneFromText(snippet) || extractPhoneFromText(title);
        const score = calculateScore(result);

        // Extract name from title (usually format: "Name (@username) • Instagram")
        let name = title.split('•')[0].trim();
        name = name.replace(/@\w+/g, '').replace(/[()]/g, '').trim();
        if (!name || name.toLowerCase() === 'instagram') {
          name = username;
        }

        allResults.push({
          name,
          username,
          profileUrl: link,
          bio: snippet,
          city: location.city,
          state: location.state,
          source: 'instagram',
          whatsapp: whatsapp || undefined,
          instagram: link,
          phone: phone || undefined,
          score,
        });
      }
    }

    // Sort by score (highest first) and remove duplicates by username
    const uniqueResults = allResults
      .sort((a, b) => b.score - a.score)
      .filter((item, index, self) => 
        index === self.findIndex(t => t.username === item.username)
      );

    console.log(`Found ${uniqueResults.length} unique Instagram profiles`);

    return new Response(
      JSON.stringify({ success: true, data: uniqueResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-instagram:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

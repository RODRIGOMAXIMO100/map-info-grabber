import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Business {
  name: string;
  website?: string;
  phone?: string;
}

interface EnrichRequest {
  businesses: Business[];
  useFirecrawl?: boolean;
}

// Check if a phone number is mobile
function isMobileNumber(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) return digits[4] === '9';
  if (digits.length === 11) return digits[2] === '9';
  return false;
}

// Extract WhatsApp link
function extractWhatsApp(phone: string | null): string {
  if (!phone || !isMobileNumber(phone)) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = '55' + digits;
  return `https://wa.me/${digits}`;
}

// Extract Instagram from text/html
function extractInstagram(text: string): string {
  const patterns = [
    /instagram\.com\/([a-zA-Z0-9_.]+)/i,
    /@([a-zA-Z0-9_.]+)\s*(?:instagram|insta)/i,
    /(?:instagram|insta)[:\s]*@?([a-zA-Z0-9_.]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      const username = match[1].replace(/[\/\?#].*$/, '');
      if (!['p', 'reel', 'stories', 'tv', 'explore'].includes(username.toLowerCase())) {
        return `https://instagram.com/${username}`;
      }
    }
  }
  return '';
}

// Extract email from text
function extractEmail(text: string): string {
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailPattern);
  if (matches && matches.length > 0) {
    // Filter out common non-email patterns
    const validEmails = matches.filter(email => 
      !email.includes('example') && 
      !email.includes('test') &&
      !email.includes('sentry') &&
      !email.endsWith('.png') &&
      !email.endsWith('.jpg')
    );
    return validEmails[0] || '';
  }
  return '';
}

// Extract phone from text
function extractPhone(text: string): string {
  const phonePatterns = [
    /\(?\d{2}\)?\s*9\s*\d{4}[-.\s]?\d{4}/g, // Mobile with 9
    /\(?\d{2}\)?\s*\d{4}[-.\s]?\d{4}/g, // Landline
  ];
  
  for (const pattern of phonePatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  }
  return '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { businesses, useFirecrawl = true }: EnrichRequest = await req.json();

    if (!businesses || businesses.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'businesses array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!FIRECRAWL_API_KEY && useFirecrawl) {
      console.log('[Enrich] Firecrawl not configured, skipping website enrichment');
    }

    const enrichedResults: any[] = [];
    let firecrawlCreditsUsed = 0;

    for (const business of businesses) {
      const enriched: any = { ...business };

      // If we have a website and Firecrawl is available, scrape it
      if (business.website && FIRECRAWL_API_KEY && useFirecrawl) {
        try {
          console.log(`[Enrich] Scraping: ${business.website}`);

          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: business.website,
              formats: ['markdown'],
              onlyMainContent: false,
              waitFor: 2000,
            }),
          });

          if (response.ok) {
            const data = await response.json();
            const content = data.data?.markdown || data.markdown || '';
            
            if (content) {
              // Extract data from scraped content
              const instagram = extractInstagram(content);
              const email = extractEmail(content);
              const phone = extractPhone(content);

              if (instagram) enriched.instagram = instagram;
              if (email && !enriched.email) enriched.email = email;
              if (phone && !enriched.phone) {
                enriched.phone = phone;
                enriched.whatsapp = extractWhatsApp(phone);
              }

              firecrawlCreditsUsed++;
              console.log(`[Enrich] Found - IG: ${instagram || 'N'}, Email: ${email || 'N'}, Phone: ${phone || 'N'}`);
            }
          } else if (response.status === 402) {
            console.log('[Enrich] Firecrawl credits exhausted');
            // Continue without Firecrawl for remaining businesses
          } else {
            console.log(`[Enrich] Firecrawl error: ${response.status}`);
          }
        } catch (scrapeError) {
          console.error(`[Enrich] Scrape error for ${business.website}:`, scrapeError);
        }
      }

      enrichedResults.push(enriched);
    }

    console.log(`[Enrich] Completed: ${enrichedResults.length} businesses, ${firecrawlCreditsUsed} Firecrawl credits used`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: enrichedResults,
        stats: {
          total: enrichedResults.length,
          firecrawlCreditsUsed,
          withInstagram: enrichedResults.filter(r => r.instagram).length,
          withEmail: enrichedResults.filter(r => r.email).length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Enrich] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

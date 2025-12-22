import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScrapeRequest {
  urls: string[];
}

interface ScrapeResult {
  url: string;
  whatsapp?: string;
  phone?: string;
  instagram?: string;
  success: boolean;
  error?: string;
}

// Extract WhatsApp from scraped content
function extractWhatsApp(content: string): string | null {
  if (!content) return null;
  
  // Look for wa.me links
  const waLinkPatterns = [
    /https?:\/\/wa\.me\/(\d+)/gi,
    /wa\.me\/(\d+)/gi,
    /https?:\/\/api\.whatsapp\.com\/send\?phone=(\d+)/gi,
    /api\.whatsapp\.com\/send\?phone=(\d+)/gi,
  ];
  
  for (const pattern of waLinkPatterns) {
    const match = content.match(pattern);
    if (match) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 10) {
        return `https://wa.me/${digits}`;
      }
    }
  }
  
  // Look for Brazilian mobile phone patterns (with 9 as first digit after DDD)
  const mobilePatterns = [
    /\(?\d{2}\)?\s*9\s*\d{4}[-.\s]?\d{4}/g,
    /\+55\s*\d{2}\s*9\s*\d{4}[-.\s]?\d{4}/g,
    /55\d{2}9\d{8}/g,
  ];
  
  for (const pattern of mobilePatterns) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 13) {
          // Ensure it starts with 55 (Brazil) and has 9 after DDD
          let formatted = digits;
          if (!formatted.startsWith('55')) {
            formatted = '55' + formatted;
          }
          return `https://wa.me/${formatted}`;
        }
      }
    }
  }
  
  return null;
}

// Extract phone from scraped content
function extractPhone(content: string): string | null {
  if (!content) return null;
  
  const phonePatterns = [
    /\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g,
    /\+55\s*\d{2}\s*\d{4,5}[-.\s]?\d{4}/g,
  ];
  
  for (const pattern of phonePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[0];
    }
  }
  
  return null;
}

// Extract Instagram from scraped content
function extractInstagram(content: string): string | null {
  if (!content) return null;
  
  const igPatterns = [
    /https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)/gi,
    /@([a-zA-Z0-9_.]+)(?:\s|$)/g,
  ];
  
  for (const pattern of igPatterns) {
    const match = content.match(pattern);
    if (match) {
      if (match[0].includes('instagram.com')) {
        return match[0];
      }
      // For @ mentions, construct URL
      const username = match[0].replace('@', '').trim();
      if (username && !['gmail', 'hotmail', 'yahoo', 'outlook'].some(e => username.includes(e))) {
        return `https://instagram.com/${username}`;
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { urls }: ScrapeRequest = await req.json();

    if (!urls || urls.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'urls array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: ScrapeResult[] = [];

    // Process URLs in batches of 5 to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (url) => {
        try {
          // Format URL
          let formattedUrl = url.trim();
          if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
            formattedUrl = `https://${formattedUrl}`;
          }

          console.log('Scraping URL:', formattedUrl);

          const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: formattedUrl,
              formats: ['markdown'],
              onlyMainContent: false,
              waitFor: 2000,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Firecrawl error for ${formattedUrl}:`, errorText);
            return {
              url,
              success: false,
              error: `Failed to scrape: ${response.status}`,
            };
          }

          const data = await response.json();
          const content = data.data?.markdown || data.markdown || '';
          
          const whatsapp = extractWhatsApp(content);
          const phone = extractPhone(content);
          const instagram = extractInstagram(content);

          console.log(`Scraped ${formattedUrl}: WhatsApp=${!!whatsapp}, Phone=${!!phone}, Instagram=${!!instagram}`);

          return {
            url,
            whatsapp: whatsapp || undefined,
            phone: phone || undefined,
            instagram: instagram || undefined,
            success: true,
          };

        } catch (error) {
          console.error(`Error scraping ${url}:`, error);
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const withWhatsApp = results.filter(r => r.whatsapp).length;

    console.log(`Scraped ${successCount}/${urls.length} URLs, ${withWhatsApp} with WhatsApp`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: results,
        stats: {
          total: urls.length,
          scraped: successCount,
          withWhatsApp,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-whatsapp:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

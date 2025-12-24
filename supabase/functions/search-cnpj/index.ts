import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EnrichRequest {
  cnpj?: string;
  cnpjs?: string[];
}

// Format CNPJ - remove non-digits
function formatCNPJ(cnpj: string): string {
  return cnpj.replace(/\D/g, '');
}

// Check if a phone number is mobile
function isMobileNumber(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13) return digits[4] === '9';
  if (digits.length === 11) return digits[2] === '9';
  if (digits.length === 10 || digits.length === 8) return false;
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
    const { cnpj, cnpjs }: EnrichRequest = await req.json();
    
    const cnpjList = cnpjs || (cnpj ? [cnpj] : []);
    
    if (cnpjList.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'cnpj or cnpjs is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: any[] = [];

    for (const rawCnpj of cnpjList) {
      const formattedCnpj = formatCNPJ(rawCnpj);
      
      if (formattedCnpj.length !== 14) {
        console.log(`[OpenCNPJ] Invalid CNPJ format: ${rawCnpj}`);
        continue;
      }

      console.log(`[OpenCNPJ] Fetching: ${formattedCnpj}`);

      try {
        // OpenCNPJ API - 100% FREE and UNLIMITED
        const response = await fetch(`https://api.opencnpj.org/${formattedCnpj}`);

        if (!response.ok) {
          console.log(`[OpenCNPJ] Not found or error for ${formattedCnpj}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        // Extract phone numbers
        const phones: string[] = [];
        if (data.telefone_1) phones.push(data.telefone_1);
        if (data.telefone_2) phones.push(data.telefone_2);
        
        // Find mobile phone for WhatsApp
        const mobilePhone = phones.find(p => isMobileNumber(p)) || phones[0] || '';
        const whatsapp = extractWhatsApp(mobilePhone);

        results.push({
          cnpj: formattedCnpj,
          name: data.razao_social || data.nome_fantasia || '',
          tradeName: data.nome_fantasia || '',
          address: [
            data.logradouro,
            data.numero,
            data.complemento,
            data.bairro,
            data.municipio,
            data.uf,
            data.cep
          ].filter(Boolean).join(', '),
          phone: mobilePhone,
          phones: phones,
          email: data.email || '',
          whatsapp: whatsapp,
          city: data.municipio || '',
          state: data.uf || '',
          activity: data.cnae_fiscal_descricao || '',
          situation: data.situacao_cadastral || '',
          capital: data.capital_social || 0,
          openedAt: data.data_inicio_atividade || '',
          source: 'opencnpj',
        });

        console.log(`[OpenCNPJ] Found: ${data.razao_social || data.nome_fantasia}`);

      } catch (fetchError) {
        console.error(`[OpenCNPJ] Fetch error for ${formattedCnpj}:`, fetchError);
      }
    }

    console.log(`[OpenCNPJ] Total enriched: ${results.length}/${cnpjList.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: results, 
        apiUsed: 'opencnpj',
        note: 'OpenCNPJ API - 100% gratuito e ilimitado' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OpenCNPJ] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

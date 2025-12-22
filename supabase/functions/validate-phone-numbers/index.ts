import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppConfig {
  id: string;
  server_url: string;
  instance_token: string;
  is_active: boolean;
}

interface ValidationResult {
  phone: string;
  exists: boolean;
  formattedNumber: string | null;
  isLandline: boolean;
  error?: string;
}

// Check if a phone number looks like a Brazilian landline (8 digits, no 9 prefix)
const isLikelyLandline = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  
  // Brazilian format: DDD (2 digits) + number
  // Mobile: 9xxxx-xxxx (9 digits after DDD)
  // Landline: xxxx-xxxx (8 digits after DDD)
  
  if (digits.startsWith('55')) {
    const localPart = digits.slice(4); // Remove 55 + DDD
    return localPart.length === 8 || (localPart.length >= 8 && !localPart.startsWith('9'));
  }
  
  // Without country code
  if (digits.length === 10) {
    const localPart = digits.slice(2); // Remove DDD
    return !localPart.startsWith('9');
  }
  
  return false;
};

// Format phone number for WhatsApp API
const formatPhoneForWhatsApp = (phone: string): string => {
  let digits = phone.replace(/\D/g, '');
  
  // Add Brazil country code if not present
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  return digits;
};

// Check if a number exists on WhatsApp using UAZAPI
const checkNumberOnWhatsApp = async (
  serverUrl: string, 
  token: string, 
  phone: string
): Promise<{ exists: boolean; formattedNumber: string | null; error?: string }> => {
  try {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    
    // UAZAPI endpoint to check number
    const response = await fetch(`${serverUrl}/chat/whatsappNumbers/${formattedPhone}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      // Try alternative endpoint
      const altResponse = await fetch(`${serverUrl}/misc/onWhatsApp`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: formattedPhone }),
      });
      
      if (!altResponse.ok) {
        return { exists: false, formattedNumber: null, error: 'API error' };
      }
      
      const altData = await altResponse.json();
      return {
        exists: altData.exists === true || altData.onWhatsApp === true,
        formattedNumber: altData.jid || formattedPhone,
      };
    }
    
    const data = await response.json();
    
    // Different API response formats
    const exists = data.exists === true || 
                   data.onWhatsApp === true || 
                   (Array.isArray(data) && data.length > 0 && data[0]?.exists);
    
    return {
      exists,
      formattedNumber: data.jid || data.number || formattedPhone,
    };
  } catch (error) {
    console.error(`Error checking number ${phone}:`, error);
    return { exists: false, formattedNumber: null, error: String(error) };
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phones, broadcastListId } = await req.json();

    if (!phones || !Array.isArray(phones) || phones.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Lista de telefones é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Validating ${phones.length} phone numbers for broadcast ${broadcastListId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get an active WhatsApp config to use for validation
    const { data: configs, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (configError || !configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Nenhuma instância WhatsApp configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configs[0] as WhatsAppConfig;
    console.log(`Using WhatsApp instance: ${config.id}`);

    const results: ValidationResult[] = [];
    const validPhones: string[] = [];
    const invalidPhones: string[] = [];
    const landlinePhones: string[] = [];

    // Process phones in batches to avoid overwhelming the API
    const batchSize = 10;
    const delayBetweenBatches = 2000; // 2 seconds

    for (let i = 0; i < phones.length; i += batchSize) {
      const batch = phones.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (phone: string) => {
        const isLandline = isLikelyLandline(phone);
        
        // If it's a landline, mark as invalid without API call
        if (isLandline) {
          landlinePhones.push(phone);
          invalidPhones.push(phone);
          return {
            phone,
            exists: false,
            formattedNumber: null,
            isLandline: true,
            error: 'Número fixo (sem WhatsApp)',
          };
        }

        // Check on WhatsApp API
        const result = await checkNumberOnWhatsApp(config.server_url, config.instance_token, phone);
        
        if (result.exists) {
          validPhones.push(phone);
        } else {
          invalidPhones.push(phone);
        }

        return {
          phone,
          exists: result.exists,
          formattedNumber: result.formattedNumber,
          isLandline: false,
          error: result.error,
        };
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Log progress
      console.log(`Processed ${Math.min(i + batchSize, phones.length)}/${phones.length} numbers`);

      // Add delay between batches (except for the last batch)
      if (i + batchSize < phones.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Update broadcast list with validation results if broadcastListId is provided
    if (broadcastListId) {
      const { error: updateError } = await supabase
        .from('broadcast_lists')
        .update({
          validated_at: new Date().toISOString(),
          valid_count: validPhones.length,
          invalid_count: invalidPhones.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', broadcastListId);

      if (updateError) {
        console.error('Error updating broadcast list:', updateError);
      }
    }

    const summary = {
      total: phones.length,
      valid: validPhones.length,
      invalid: invalidPhones.length,
      landlines: landlinePhones.length,
      successRate: Math.round((validPhones.length / phones.length) * 100),
    };

    console.log('Validation complete:', summary);

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
        validPhones,
        invalidPhones,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in validate-phone-numbers:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LeadPayload {
  phone: string;
  name?: string;
  funnel_id?: string;
  stage_id?: string;
  origin?: string;
  notes?: string;
  city?: string;
  state?: string;
  tags?: string[];
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Add Brazil country code if not present
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  
  // Handle 9-digit mobile numbers (add 9 if missing)
  if (cleaned.length === 12 && cleaned.startsWith('55')) {
    const ddd = cleaned.substring(2, 4);
    const number = cleaned.substring(4);
    if (number.length === 8 && !number.startsWith('9')) {
      cleaned = '55' + ddd + '9' + number;
    }
  }
  
  return cleaned;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API Key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('X-API-Key');
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key is required', code: 'MISSING_API_KEY' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if API key is valid
    const { data: keyData, error: keyError } = await supabase
      .from('integration_api_keys')
      .select('id, name, is_active, usage_count')
      .eq('api_key', apiKey)
      .single();

    if (keyError || !keyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key', code: 'INVALID_API_KEY' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!keyData.is_active) {
      return new Response(
        JSON.stringify({ error: 'API key is inactive', code: 'INACTIVE_API_KEY' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: LeadPayload = await req.json();

    // Validate required fields
    if (!body.phone) {
      return new Response(
        JSON.stringify({ error: 'Phone is required', code: 'MISSING_PHONE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedPhone = normalizePhone(body.phone);

    // Validate phone format
    if (normalizedPhone.length < 12 || normalizedPhone.length > 13) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone format', code: 'INVALID_PHONE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build UTM data object
    const utmData = {
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      utm_term: body.utm_term || null,
      utm_content: body.utm_content || null,
    };

    // Check if lead already exists
    const { data: existingLead } = await supabase
      .from('whatsapp_conversations')
      .select('id, name, funnel_stage')
      .eq('phone', normalizedPhone)
      .single();

    let leadId: string;
    let isNew = false;

    if (existingLead) {
      // Update existing lead with new data
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // Only update fields if provided
      if (body.name && !existingLead.name) updateData.name = body.name;
      if (body.notes) updateData.notes = body.notes;
      if (body.city) updateData.lead_city = body.city;
      if (body.state) updateData.lead_state = body.state;
      if (body.origin) updateData.origin = body.origin;
      
      // Update UTM data if any UTM field is provided
      if (Object.values(utmData).some(v => v !== null)) {
        updateData.utm_data = utmData;
      }

      // Update tags (merge with existing)
      if (body.tags && body.tags.length > 0) {
        const { data: currentLead } = await supabase
          .from('whatsapp_conversations')
          .select('custom_tags')
          .eq('id', existingLead.id)
          .single();
        
        const existingTags = currentLead?.custom_tags || [];
        const mergedTags = [...new Set([...existingTags, ...body.tags])];
        updateData.custom_tags = mergedTags;
      }

      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update(updateData)
        .eq('id', existingLead.id);

      if (updateError) {
        console.error('Error updating lead:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to update lead', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      leadId = existingLead.id;
    } else {
      // Get default funnel if not provided
      let funnelId = body.funnel_id;
      let stageId = body.stage_id;

      if (!funnelId) {
        const { data: defaultFunnel } = await supabase
          .from('crm_funnels')
          .select('id')
          .eq('is_default', true)
          .single();
        
        if (defaultFunnel) {
          funnelId = defaultFunnel.id;
        }
      }

      // Get first stage of funnel if stage not provided
      if (funnelId && !stageId) {
        const { data: firstStage } = await supabase
          .from('crm_funnel_stages')
          .select('id')
          .eq('funnel_id', funnelId)
          .order('stage_order', { ascending: true })
          .limit(1)
          .single();
        
        if (firstStage) {
          stageId = firstStage.id;
        }
      }

      // Create new lead
      const newLead = {
        phone: normalizedPhone,
        name: body.name || null,
        origin: body.origin || 'webhook',
        notes: body.notes || null,
        lead_city: body.city || null,
        lead_state: body.state || null,
        custom_tags: body.tags || [],
        utm_data: utmData,
        crm_funnel_id: funnelId || null,
        funnel_stage: stageId || null,
        is_crm_lead: true,
        ai_paused: false,
        status: 'active',
      };

      const { data: createdLead, error: createError } = await supabase
        .from('whatsapp_conversations')
        .insert(newLead)
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating lead:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create lead', details: createError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      leadId = createdLead.id;
      isNew = true;
    }

    // Update API key usage stats
    await supabase
      .from('integration_api_keys')
      .update({
        last_used_at: new Date().toISOString(),
        usage_count: keyData.usage_count ? keyData.usage_count + 1 : 1,
      })
      .eq('id', keyData.id);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        is_new: isNew,
        message: isNew ? 'Lead criado com sucesso' : 'Lead atualizado com sucesso',
        phone: normalizedPhone,
      }),
      { status: isNew ? 201 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error processing request:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

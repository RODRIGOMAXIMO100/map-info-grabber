import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, labelId, action, conversationId } = await req.json();

    if (!labelId || !action) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find conversation
    let targetConversationId = conversationId;
    if (!targetConversationId && phone) {
      const formattedPhone = phone.replace(/\D/g, '');
      const { data: foundConv } = await supabase
        .from('whatsapp_conversations')
        .select('id')
        .eq('phone', formattedPhone)
        .maybeSingle();
      
      if (foundConv) targetConversationId = foundConv.id;
    }

    if (!targetConversationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Conversation not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Update local database
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('tags')
      .eq('id', targetConversationId)
      .single();

    let currentTags: string[] = conversation?.tags || [];
    const labelIdStr = String(labelId);
    
    if (action === 'add' && !currentTags.includes(labelIdStr)) {
      currentTags = [...currentTags, labelIdStr];
    } else if (action === 'remove') {
      currentTags = currentTags.filter((t: string) => String(t) !== labelIdStr);
    }

    await supabase
      .from('whatsapp_conversations')
      .update({ tags: [...new Set(currentTags)], updated_at: new Date().toISOString() })
      .eq('id', targetConversationId);

    console.log(`[Label] Updated conversation ${targetConversationId}: ${action} label ${labelId}`);

    return new Response(
      JSON.stringify({ success: true, message: `Label ${action === 'add' ? 'added' : 'removed'}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error updating label:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

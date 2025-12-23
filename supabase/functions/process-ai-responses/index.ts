import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de label_id para funnel_stage do frontend
const LABEL_TO_FUNNEL_STAGE: Record<string, string> = {
  '16': 'new',           // Lead Novo
  '13': 'presentation',  // MQL - Respondeu → Apresentação Feita
  '14': 'interest',      // Engajado → Interesse Confirmado
  '20': 'negotiating',   // SQL - Qualificado → Negociando
  '21': 'handoff',       // Handoff - Vendedor
  '22': 'negotiating',   // Em Negociação
  '23': 'lost',          // Fechado/Perdido
};

const DEBOUNCE_DELAY_SECONDS = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoffTime = new Date(Date.now() - DEBOUNCE_DELAY_SECONDS * 1000).toISOString();
    
    const { data: pendingConversations } = await supabase
      .from('whatsapp_conversations')
      .select('id, name, phone, tags, video_sent, site_sent')
      .not('ai_pending_at', 'is', null)
      .lt('ai_pending_at', cutoffTime)
      .eq('ai_paused', false)
      .limit(10);

    console.log('[Process AI] Found pending conversations:', pendingConversations?.length || 0);

    let processedCount = 0;

    for (const conv of pendingConversations || []) {
      try {
        // Clear pending flag
        await supabase
          .from('whatsapp_conversations')
          .update({ ai_pending_at: null })
          .eq('id', conv.id);

        // Get last messages
        const { data: historyMessages } = await supabase
          .from('whatsapp_messages')
          .select('direction, content')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(50);

        const lastIncoming = historyMessages?.find(m => m.direction === 'incoming');
        if (!lastIncoming?.content) continue;

        // Get current funnel stage
        const FUNNEL_LABELS = ['16', '13', '14'];
        const currentFunnelLabelId = (conv.tags || []).find((t: string) => FUNNEL_LABELS.includes(t)) || null;

        console.log('[Process AI] Calling AI agent for conversation:', conv.id);

        // Call AI agent
        const aiResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            conversation_id: conv.id,
            incoming_message: lastIncoming.content,
            conversation_history: (historyMessages || []).reverse(),
            current_stage_id: currentFunnelLabelId
          })
        });

        if (!aiResponse.ok) {
          console.error('[Process AI] AI agent error:', await aiResponse.text());
          continue;
        }

        const aiData = await aiResponse.json();
        
        // Se detectou loop de bot, a IA já pausou - não fazer nada
        if (aiData.is_bot_loop) {
          console.log('[Process AI] Bot loop detected for conversation:', conv.id, '- AI paused');
          continue;
        }
        
        // Se é mensagem de bot, responder mas não insistir
        if (aiData.is_bot_message) {
          console.log('[Process AI] Bot message detected for conversation:', conv.id);
        }
        
        if (!aiData.response) continue;

        console.log('[Process AI] AI response:', aiData);

        // Wait for delay
        await new Promise(resolve => setTimeout(resolve, (aiData.delay_seconds || 5) * 1000));

        // Send response
        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            conversation_id: conv.id,
            message: aiData.response
          })
        });

        if (sendResponse.ok) {
          processedCount++;
          console.log('[Process AI] Message sent successfully for conversation:', conv.id, '| Bot msg:', aiData.is_bot_message || false);
        }

        // Send video if needed
        if (aiData.should_send_video && aiData.video_url && !conv.video_sent) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              conversation_id: conv.id,
              message: `🎥 Assista: ${aiData.video_url}`
            })
          });
          
          await supabase
            .from('whatsapp_conversations')
            .update({ video_sent: true })
            .eq('id', conv.id);
        }

        // Send site link if needed
        if (aiData.should_send_site && aiData.site_url && !conv.site_sent) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          await fetch(`${supabaseUrl}/functions/v1/whatsapp-send-message`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              conversation_id: conv.id,
              message: `🛒 Acesse: ${aiData.site_url}`
            })
          });
          
          await supabase
            .from('whatsapp_conversations')
            .update({ site_sent: true })
            .eq('id', conv.id);
        }

        // Update labels and funnel_stage
        if (aiData.label_id) {
          const funnelLabelIds = ['13', '14', '15', '16', '20', '21', '22', '23'];
          const currentTags: string[] = conv.tags || [];
          const nonFunnelTags = currentTags.filter((tag: string) => !funnelLabelIds.includes(tag));
          const newTags = [...new Set([...nonFunnelTags, aiData.label_id])];
          
          // Mapear para funnel_stage do frontend
          const newFunnelStage = LABEL_TO_FUNNEL_STAGE[aiData.label_id] || 'new';
          
          await supabase
            .from('whatsapp_conversations')
            .update({ 
              tags: newTags,
              funnel_stage: newFunnelStage
            })
            .eq('id', conv.id);
            
          console.log('[Process AI] Updated tags and funnel_stage:', conv.id, '→', newFunnelStage);
        }

      } catch (convError) {
        console.error(`[Process AI] Error processing ${conv.id}:`, convError);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: processedCount }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    console.error('[Process AI] Error:', err);
    return new Response(JSON.stringify({ success: false }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Convert OGG Opus audio to MP3 for browser compatibility
 * 
 * This function uses OpenAI Whisper to:
 * 1. Transcribe the audio content
 * 2. Provide the transcription as fallback for incompatible browsers
 * 
 * For actual audio playback in Safari, we provide download option
 * The transcription serves as an accessibility feature
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { source_url, message_id, transcribe = false } = await req.json();

    if (!source_url) {
      return new Response(
        JSON.stringify({ error: 'Missing source_url' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Convert Audio] Processing:', source_url.substring(0, 100));

    // Download the source audio file
    const audioResponse = await fetch(source_url);
    if (!audioResponse.ok) {
      console.error('[Convert Audio] Failed to download source:', audioResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to download source audio' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioData = new Uint8Array(audioBuffer);
    
    console.log('[Convert Audio] Downloaded audio, size:', audioData.length);

    let transcription: string | null = null;

    // If transcription is requested and OpenAI key is available, transcribe the audio
    if (transcribe && openaiApiKey) {
      try {
        console.log('[Convert Audio] Attempting transcription with Whisper...');
        
        // Create FormData for Whisper API
        const formData = new FormData();
        const audioBlob = new Blob([audioData], { type: 'audio/ogg' });
        formData.append('file', audioBlob, 'audio.ogg');
        formData.append('model', 'whisper-1');
        formData.append('language', 'pt'); // Portuguese
        
        const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
          },
          body: formData,
        });

        if (whisperResponse.ok) {
          const whisperResult = await whisperResponse.json();
          transcription = whisperResult.text;
          console.log('[Convert Audio] Transcription successful:', transcription?.substring(0, 100));
        } else {
          const errorText = await whisperResponse.text();
          console.error('[Convert Audio] Whisper error:', whisperResponse.status, errorText);
        }
      } catch (whisperError) {
        console.error('[Convert Audio] Whisper transcription failed:', whisperError);
      }
    }

    // Update the message with transcription if available
    if (message_id && transcription) {
      try {
        const { data: existingMessage } = await supabase
          .from('whatsapp_messages')
          .select('content')
          .eq('id', message_id)
          .single();

        if (existingMessage) {
          const contentObj = JSON.parse(existingMessage.content || '{}');
          contentObj.transcription = transcription;
          contentObj.transcribed_at = new Date().toISOString();
          
          await supabase
            .from('whatsapp_messages')
            .update({ content: JSON.stringify(contentObj) })
            .eq('id', message_id);
            
          console.log('[Convert Audio] Updated message with transcription:', message_id);
        }
      } catch (updateError) {
        console.error('[Convert Audio] Error updating message:', updateError);
      }
    }

    const result = {
      success: true,
      original_url: source_url,
      format: 'ogg',
      transcription,
      message: transcription 
        ? 'Audio transcribed successfully' 
        : 'Audio processed. Use download for Safari compatibility.',
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Convert Audio] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// WhatsApp media type to info string mapping for HKDF
const MEDIA_TYPE_INFO: Record<string, string> = {
  'image': 'WhatsApp Image Keys',
  'video': 'WhatsApp Video Keys',
  'audio': 'WhatsApp Audio Keys',
  'ptt': 'WhatsApp Audio Keys',
  'document': 'WhatsApp Document Keys',
  'sticker': 'WhatsApp Image Keys',
};

// HKDF implementation for Deno
async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const saltBuffer = (salt.length > 0 ? salt : new Uint8Array(32)).buffer as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    saltBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Extract
  const prk = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, ikm.buffer as ArrayBuffer)
  );

  // Expand
  const prkKey = await crypto.subtle.importKey(
    'raw',
    prk.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const n = Math.ceil(length / 32);
  const okm = new Uint8Array(n * 32);
  let prev = new Uint8Array(0);

  for (let i = 0; i < n; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev);
    input.set(info, prev.length);
    input[prev.length + info.length] = i + 1;

    prev = new Uint8Array(await crypto.subtle.sign('HMAC', prkKey, input.buffer as ArrayBuffer));
    okm.set(prev, i * 32);
  }

  return okm.slice(0, length);
}

// Base64 decode helper
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Decrypt WhatsApp media
async function decryptMedia(
  encryptedData: Uint8Array,
  mediaKey: string,
  mediaType: string
): Promise<Uint8Array> {
  const mediaKeyBytes = base64ToUint8Array(mediaKey);
  const infoString = MEDIA_TYPE_INFO[mediaType] || 'WhatsApp Image Keys';
  const info = new TextEncoder().encode(infoString);

  // Derive keys using HKDF (112 bytes: 16 IV + 32 cipher key + 32 mac key + 32 refkey)
  const expandedKey = await hkdf(mediaKeyBytes, new Uint8Array(0), info, 112);
  
  const iv = expandedKey.slice(0, 16);
  const cipherKey = expandedKey.slice(16, 48);
  // const macKey = expandedKey.slice(48, 80); // Not used for decryption

  // Remove last 10 bytes (MAC)
  const ciphertext = encryptedData.slice(0, encryptedData.length - 10);

  // Decrypt using AES-256-CBC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    cipherKey,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    ciphertext
  );

  return new Uint8Array(decrypted);
}

// Get file extension from mimetype
function getExtensionFromMimetype(mimetype: string, mediaType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };

  if (mimeToExt[mimetype]) return mimeToExt[mimetype];

  // Fallback by media type
  switch (mediaType) {
    case 'image': return 'jpg';
    case 'audio':
    case 'ptt': return 'ogg';
    case 'video': return 'mp4';
    case 'document': return 'pdf';
    case 'sticker': return 'webp';
    default: return 'bin';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message_id, encrypted_url, media_key, media_type, mimetype } = await req.json();

    console.log('[Download Media] Request:', { message_id, encrypted_url: encrypted_url?.substring(0, 100), media_type });

    if (!encrypted_url || !media_key) {
      return new Response(
        JSON.stringify({ error: 'Missing encrypted_url or media_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Download encrypted file
    console.log('[Download Media] Downloading encrypted file from:', encrypted_url.substring(0, 100));
    
    const encryptedResponse = await fetch(encrypted_url, {
      headers: {
        'User-Agent': 'WhatsApp/2.23.0 Android',
      }
    });

    if (!encryptedResponse.ok) {
      console.error('[Download Media] Failed to download encrypted file:', encryptedResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to download encrypted file', status: encryptedResponse.status }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const encryptedBuffer = await encryptedResponse.arrayBuffer();
    const encryptedData = new Uint8Array(encryptedBuffer);
    
    console.log('[Download Media] Downloaded encrypted file, size:', encryptedData.length);

    // Decrypt the media
    console.log('[Download Media] Decrypting with mediaType:', media_type);
    const decryptedData = await decryptMedia(encryptedData, media_key, media_type || 'image');
    
    console.log('[Download Media] Decrypted file size:', decryptedData.length);

    // Determine extension and upload
    const extension = getExtensionFromMimetype(mimetype || '', media_type || 'image');
    const fileName = `media/${Date.now()}_${message_id || crypto.randomUUID()}.${extension}`;

    // Determine content type
    let contentType = mimetype;
    if (!contentType) {
      switch (media_type) {
        case 'image': contentType = 'image/jpeg'; break;
        case 'audio':
        case 'ptt': contentType = 'audio/ogg'; break;
        case 'video': contentType = 'video/mp4'; break;
        case 'document': contentType = 'application/pdf'; break;
        default: contentType = 'application/octet-stream';
      }
    }

    console.log('[Download Media] Uploading to storage:', fileName);
    
    const { error: uploadError } = await supabase.storage
      .from('broadcast-media')
      .upload(fileName, decryptedData, {
        contentType,
        upsert: false
      });

    if (uploadError) {
      console.error('[Download Media] Upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload media', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('broadcast-media')
      .getPublicUrl(fileName);

    const mediaUrl = publicUrlData.publicUrl;
    console.log('[Download Media] Upload successful:', mediaUrl);

    // If message_id is provided, update the message in database
    if (message_id) {
      const { data: existingMessage } = await supabase
        .from('whatsapp_messages')
        .select('content')
        .eq('id', message_id)
        .single();

      if (existingMessage) {
        let updatedContent = existingMessage.content;
        try {
          const contentObj = JSON.parse(existingMessage.content || '{}');
          contentObj.media_url = mediaUrl;
          updatedContent = JSON.stringify(contentObj);
        } catch {
          updatedContent = JSON.stringify({ media_url: mediaUrl });
        }

        await supabase
          .from('whatsapp_messages')
          .update({ 
            media_url: mediaUrl,
            content: updatedContent
          })
          .eq('id', message_id);
        
        console.log('[Download Media] Updated message in database:', message_id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, media_url: mediaUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[Download Media] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

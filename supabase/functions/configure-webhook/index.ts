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
    const { instance_id, action } = await req.json();
    
    if (!instance_id) {
      return new Response(
        JSON.stringify({ error: 'instance_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch instance config
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('id', instance_id)
      .single();

    if (instanceError || !instance) {
      return new Response(
        JSON.stringify({ error: 'Instance not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serverUrl = instance.server_url.replace(/\/$/, '');
    const token = instance.instance_token;
    const expectedWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-receive-webhook?instance=${instance_id}`;

    // Check current webhook configuration
    if (action === 'check') {
      try {
        // Try different endpoints for checking webhook
        const endpoints = ['/webhook', '/config/webhook', '/instance/webhook'];
        let currentConfig = null;

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`${serverUrl}${endpoint}`, {
              method: 'GET',
              headers: {
                'token': token,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              currentConfig = await response.json();
              break;
            }
          } catch {
            // Continue to next endpoint
          }
        }

        const isConfigured = currentConfig?.url === expectedWebhookUrl || 
                            currentConfig?.webhook?.url === expectedWebhookUrl;

        return new Response(
          JSON.stringify({
            status: isConfigured ? 'configured' : currentConfig?.url || currentConfig?.webhook?.url ? 'misconfigured' : 'not_configured',
            current_url: currentConfig?.url || currentConfig?.webhook?.url || null,
            expected_url: expectedWebhookUrl,
            raw_config: currentConfig,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({
            status: 'error',
            error: 'Could not check webhook configuration',
            details: message,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Configure webhook
    if (action === 'configure') {
      try {
        // Try different endpoints for configuring webhook
        const endpoints = [
          { url: '/webhook', method: 'POST' },
          { url: '/webhook', method: 'PUT' },
          { url: '/config/webhook', method: 'POST' },
          { url: '/instance/webhook', method: 'POST' },
        ];

        let success = false;
        let lastError: string | null = null;
        let responseData = null;

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`${serverUrl}${endpoint.url}`, {
              method: endpoint.method,
              headers: {
                'token': token,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: expectedWebhookUrl,
                enabled: true,
                events: [
                  'messages.upsert',
                  'messages.update', 
                  'messages.receipt',
                  'connection.update',
                  'contacts.update',
                  'chats.update',
                ],
                // Some APIs use different property names
                webhook_url: expectedWebhookUrl,
                webhook_enabled: true,
              }),
            });

            if (response.ok) {
              responseData = await response.json();
              success = true;
              break;
            } else {
              lastError = await response.text();
            }
          } catch (e: unknown) {
            lastError = e instanceof Error ? e.message : 'Unknown error';
          }
        }

        if (success) {
          return new Response(
            JSON.stringify({
              status: 'success',
              message: 'Webhook configured successfully',
              configured_url: expectedWebhookUrl,
              response: responseData,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({
              status: 'error',
              error: 'Failed to configure webhook',
              details: lastError,
              manual_url: expectedWebhookUrl,
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({
            status: 'error',
            error: 'Could not configure webhook',
            details: message,
            manual_url: expectedWebhookUrl,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "check" or "configure"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

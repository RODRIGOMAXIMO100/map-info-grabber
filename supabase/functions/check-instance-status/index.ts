import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppConfig {
  id: string;
  name: string;
  server_url: string;
  instance_token: string;
  is_active: boolean;
}

interface StatusResult {
  configId: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  details: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for optional single instance check
    let singleConfigId: string | null = null;
    try {
      const body = await req.json();
      singleConfigId = body?.config_id || null;
    } catch {
      // No body, check all instances
    }

    // Fetch active instances
    let query = supabase
      .from('whatsapp_config')
      .select('id, name, server_url, instance_token, is_active')
      .eq('is_active', true);

    if (singleConfigId) {
      query = query.eq('id', singleConfigId);
    }

    const { data: configs, error: configError } = await query;

    if (configError) {
      throw new Error(`Failed to fetch configs: ${configError.message}`);
    }

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active instances found', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: StatusResult[] = [];

    // Check each instance
    for (const config of configs as WhatsAppConfig[]) {
      let status: 'connected' | 'disconnected' | 'error' = 'error';
      let details: Record<string, unknown> = {};

      try {
        // Clean up server URL
        const serverUrl = config.server_url.replace(/\/$/, '');
        
        // Try different status endpoints (UAZAPI variations)
        const endpoints = [
          `${serverUrl}/status`,
          `${serverUrl}/instance/status`,
          `${serverUrl}/connection/status`,
        ];

        let response: Response | null = null;
        let usedEndpoint = '';

        for (const endpoint of endpoints) {
          try {
            response = await fetch(endpoint, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${config.instance_token}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              usedEndpoint = endpoint;
              break;
            }
          } catch {
            continue;
          }
        }

        if (response && response.ok) {
          const data = await response.json();
          
          // Parse response to determine connection status
          // UAZAPI returns nested format: { status: { checked_instance: { connection_status: 'connected' } } }
          const isConnected = 
            // Legacy/simple formats
            data.connected === true ||
            data.state === 'open' ||
            data.state === 'connected' ||
            data.status === 'connected' ||
            data.status === 'open' ||
            data.instance?.state === 'open' ||
            data.instance?.connected === true ||
            // UAZAPI nested format
            data.status?.checked_instance?.connection_status === 'connected' ||
            data.status?.checked_instance?.is_healthy === true ||
            data.status?.server_status === 'running';

          status = isConnected ? 'connected' : 'disconnected';
          details = {
            endpoint: usedEndpoint,
            rawResponse: data,
            checkedAt: new Date().toISOString(),
          };
        } else {
          status = 'error';
          details = {
            error: 'No valid response from any endpoint',
            statusCode: response?.status,
            checkedAt: new Date().toISOString(),
          };
        }
      } catch (e) {
        status = 'error';
        details = {
          error: e instanceof Error ? e.message : 'Unknown error',
          checkedAt: new Date().toISOString(),
        };
      }

      results.push({
        configId: config.id,
        name: config.name || 'Instância',
        status,
        details,
      });

      // Save status to database
      await supabase
        .from('whatsapp_instance_status')
        .insert({
          config_id: config.id,
          status,
          details,
        });
    }

    // Clean old status records (keep last 24h)
    await supabase.rpc('clean_old_instance_status');

    // Check for disconnected instances and log warning
    const disconnected = results.filter(r => r.status !== 'connected');
    if (disconnected.length > 0) {
      console.warn(`⚠️ Disconnected instances: ${disconnected.map(d => d.name).join(', ')}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        results,
        summary: {
          total: results.length,
          connected: results.filter(r => r.status === 'connected').length,
          disconnected: results.filter(r => r.status === 'disconnected').length,
          error: results.filter(r => r.status === 'error').length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error checking instance status:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

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
  instance_phone: string | null;
  is_active: boolean;
}

interface StatusResult {
  configId: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  rawState: string | null;
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

    // Fetch active instances - now including instance_phone
    let query = supabase
      .from('whatsapp_config')
      .select('id, name, server_url, instance_token, instance_phone, is_active')
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
      let status: 'connected' | 'disconnected' | 'connecting' | 'error' = 'error';
      let rawState: string | null = null;
      let details: Record<string, unknown> = {};

      try {
        // Clean up server URL
        const serverUrl = config.server_url.replace(/\/$/, '');
        const instancePhone = config.instance_phone;
        
        console.log(`[Status Check] ========================================`);
        console.log(`[Status Check] Instance: ${config.name} (ID: ${config.id})`);
        console.log(`[Status Check] Phone: ${instancePhone}`);
        console.log(`[Status Check] Server URL: ${serverUrl}`);
        
        // UAZAPI V2 uses /instance/status with 'token' header (not Bearer)
        // The token identifies the instance, no need for phone in URL
        const primaryEndpoint = `${serverUrl}/instance/status`;
        
        console.log(`[Status Check] Calling primary endpoint: ${primaryEndpoint}`);

        let response: Response | null = null;
        let usedEndpoint = '';
        let responseData: Record<string, unknown> | null = null;

        try {
          // UAZAPI V2 requires 'token' header, not 'Authorization: Bearer'
          response = await fetch(primaryEndpoint, {
            method: 'GET',
            headers: {
              'token': config.instance_token,
              'Content-Type': 'application/json',
            },
          });

          console.log(`[Status Check] Response status: ${response.status}`);

          if (response.ok) {
            usedEndpoint = primaryEndpoint;
            responseData = await response.json();
            console.log(`[Status Check] Response data:`, JSON.stringify(responseData));
          } else {
            const errorText = await response.text();
            console.log(`[Status Check] Error response: ${errorText}`);
            
            // Try fallback with /status endpoint (server health check - less reliable)
            console.log(`[Status Check] Trying fallback: ${serverUrl}/status`);
            const fallbackResponse = await fetch(`${serverUrl}/status`, {
              method: 'GET',
              headers: {
                'token': config.instance_token,
                'Content-Type': 'application/json',
              },
            });
            
            if (fallbackResponse.ok) {
              usedEndpoint = `${serverUrl}/status`;
              responseData = await fallbackResponse.json();
              console.log(`[Status Check] Fallback response:`, JSON.stringify(responseData));
            } else {
              const fallbackError = await fallbackResponse.text();
              console.log(`[Status Check] Fallback error: ${fallbackError}`);
            }
          }
        } catch (fetchError) {
          console.log(`[Status Check] Fetch error:`, fetchError);
        }

        if (responseData) {
          // UAZAPI V2 /instance/status response format:
          // {
          //   instance: { status: "connected" | "disconnected" | "connecting", ... },
          //   status: { connected: true/false, loggedIn: true/false, jid: "..." }
          // }
          
          // Extract instance and status objects
          const instanceObj = responseData.instance as Record<string, unknown> | undefined;
          const statusObj = responseData.status as Record<string, unknown> | undefined;
          
          // Primary check: instance.status field (most reliable)
          const instanceStatus = instanceObj?.status as string | undefined;
          
          // Secondary check: status.connected and status.loggedIn
          const isStatusConnected = statusObj?.connected === true;
          const isLoggedIn = statusObj?.loggedIn === true;
          
          console.log(`[Status Check] instance.status: ${instanceStatus}`);
          console.log(`[Status Check] status.connected: ${isStatusConnected}`);
          console.log(`[Status Check] status.loggedIn: ${isLoggedIn}`);
          
          // Store the raw state
          rawState = instanceStatus || null;
          
          // Determine connection status
          if (instanceStatus === 'connected' && isStatusConnected && isLoggedIn) {
            status = 'connected';
          } else if (instanceStatus === 'connecting') {
            status = 'connecting';
          } else if (instanceStatus === 'connected' && (!isStatusConnected || !isLoggedIn)) {
            // Instance says connected but status says not - treat as disconnected
            status = 'disconnected';
            console.log(`[Status Check] Mismatch: instance=connected but status.connected=${isStatusConnected}, loggedIn=${isLoggedIn}`);
          } else if (instanceStatus === 'disconnected' || instanceStatus === 'close') {
            status = 'disconnected';
          } else {
            // Fallback: check other possible response formats (legacy)
            const legacyState = responseData.state as string | undefined;
            
            if (legacyState === 'open') {
              status = 'connected';
            } else if (legacyState === 'connecting') {
              status = 'connecting';
            } else if (legacyState === 'close' || legacyState === 'refused') {
              status = 'disconnected';
            } else if (isStatusConnected && isLoggedIn) {
              // Trust status object if no instance.status
              status = 'connected';
            } else {
              status = 'disconnected';
            }
          }
          
          details = {
            endpoint: usedEndpoint,
            rawState: instanceStatus || 'unknown',
            instanceStatus,
            statusConnected: isStatusConnected,
            statusLoggedIn: isLoggedIn,
            lastDisconnect: instanceObj?.lastDisconnect as string | undefined,
            lastDisconnectReason: instanceObj?.lastDisconnectReason as string | undefined,
            rawResponse: responseData,
            checkedAt: new Date().toISOString(),
          };
          
          console.log(`[Status Check] Final interpreted status: ${status}`);
        } else {
          status = 'error';
          details = {
            error: 'No valid response from any endpoint',
            triedEndpoints: [primaryEndpoint, `${serverUrl}/status`],
            statusCode: response?.status,
            checkedAt: new Date().toISOString(),
          };
          console.log(`[Status Check] ERROR: No valid response from any endpoint`);
        }
      } catch (e) {
        status = 'error';
        details = {
          error: e instanceof Error ? e.message : 'Unknown error',
          checkedAt: new Date().toISOString(),
        };
        console.error(`[Status Check] Exception:`, e);
      }

      console.log(`[Status Check] ========================================`);

      results.push({
        configId: config.id,
        name: config.name || 'Instância',
        status,
        rawState,
        details,
      });

      // Save status to database
      await supabase
        .from('whatsapp_instance_status')
        .insert({
          config_id: config.id,
          status,
          details: {
            ...details,
            rawState,
          },
        });
    }

    // Clean old status records (keep last 24h)
    await supabase.rpc('clean_old_instance_status');

    // Check for disconnected instances and log warning
    const disconnected = results.filter(r => r.status !== 'connected');
    if (disconnected.length > 0) {
      console.warn(`⚠️ Disconnected/Error instances: ${disconnected.map(d => `${d.name} (${d.status}${d.rawState ? `: ${d.rawState}` : ''})`).join(', ')}`);
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
          connecting: results.filter(r => r.status === 'connecting').length,
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

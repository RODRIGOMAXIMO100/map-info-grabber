import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, TestTube, Loader2, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [copied, setCopied] = useState(false);
  
  const webhookUrl = `https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/whatsapp-receive-webhook`;
  
  const [config, setConfig] = useState({
    id: '',
    server_url: '',
    instance_token: '',
    admin_token: '',
    instance_phone: '',
    is_active: true,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setConfig({
          id: data.id,
          server_url: data.server_url || '',
          instance_token: data.instance_token || '',
          admin_token: data.admin_token || '',
          instance_phone: data.instance_phone || '',
          is_active: data.is_active ?? true,
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.server_url || !config.instance_token) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a URL do servidor e o token da instância.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (config.id) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update({
            server_url: config.server_url,
            instance_token: config.instance_token,
            admin_token: config.admin_token || null,
            instance_phone: config.instance_phone || null,
            is_active: config.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('whatsapp_config')
          .insert({
            server_url: config.server_url,
            instance_token: config.instance_token,
            admin_token: config.admin_token || null,
            instance_phone: config.instance_phone || null,
            is_active: config.is_active,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast({
        title: 'Configuração salva!',
        description: 'As credenciais do WhatsApp foram atualizadas.',
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a configuração.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.server_url || !config.instance_token) {
      toast({
        title: 'Configure primeiro',
        description: 'Preencha a URL do servidor e o token antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const serverUrl = config.server_url.replace(/\/$/, '');
      
      // Try multiple UAZAPI endpoints for compatibility
      const endpoints = ['/status', '/session/status', '/instance/status'];
      let success = false;
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${serverUrl}${endpoint}`, {
            method: 'GET',
            headers: {
              'token': config.instance_token,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            success = true;
            break;
          }
        } catch {
          continue;
        }
      }

      if (success) {
        setTestResult('success');
        toast({
          title: 'Conexão bem-sucedida!',
          description: 'O WhatsApp está conectado e funcionando.',
        });
      } else {
        throw new Error('Nenhum endpoint respondeu');
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setTestResult('error');
      toast({
        title: 'Falha na conexão',
        description: 'Verifique as credenciais e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({
      title: 'URL copiada!',
      description: 'Cole esta URL no painel da UAZAPI.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuração WhatsApp</h1>
            <p className="text-muted-foreground">Configure a integração com UAZAPI</p>
          </div>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle>Webhook URL</CardTitle>
            <CardDescription>
              Configure esta URL no painel da UAZAPI para receber mensagens.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="font-mono text-sm bg-background"
              />
              <Button variant="outline" size="icon" onClick={copyWebhookUrl}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ⚠️ Cole esta URL no campo de Webhook do painel UAZAPI para receber mensagens.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credenciais UAZAPI</CardTitle>
            <CardDescription>
              Insira as credenciais da sua instância UAZAPI para habilitar o envio de mensagens.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server_url">URL do Servidor *</Label>
              <Input
                id="server_url"
                placeholder="https://seuservidor.uazapi.com"
                value={config.server_url}
                onChange={(e) => setConfig(prev => ({ ...prev, server_url: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance_token">Token da Instância *</Label>
              <Input
                id="instance_token"
                type="password"
                placeholder="Seu token de autenticação"
                value={config.instance_token}
                onChange={(e) => setConfig(prev => ({ ...prev, instance_token: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin_token">Token Admin (opcional)</Label>
              <Input
                id="admin_token"
                type="password"
                placeholder="Token de administração"
                value={config.admin_token}
                onChange={(e) => setConfig(prev => ({ ...prev, admin_token: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instance_phone">Telefone da Instância</Label>
              <Input
                id="instance_phone"
                placeholder="5511999999999"
                value={config.instance_phone}
                onChange={(e) => setConfig(prev => ({ ...prev, instance_phone: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label>Instância Ativa</Label>
                <p className="text-sm text-muted-foreground">
                  Habilita/desabilita o envio de mensagens
                </p>
              </div>
              <Switch
                checked={config.is_active}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="gap-2"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testResult === 'success' ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : testResult === 'error' ? (
              <XCircle className="h-4 w-4 text-red-500" />
            ) : (
              <TestTube className="h-4 w-4" />
            )}
            Testar Conexão
          </Button>
          
          <Button onClick={handleSave} disabled={saving} className="gap-2 flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configuração
          </Button>
        </div>
      </div>
    </div>
  );
}

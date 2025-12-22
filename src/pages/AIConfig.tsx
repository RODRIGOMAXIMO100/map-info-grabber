import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Bot, Clock, Link, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppAIConfig } from '@/types/whatsapp';

export default function AIConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [config, setConfig] = useState<Partial<WhatsAppAIConfig>>({
    id: '',
    is_active: false,
    system_prompt: '',
    video_url: '',
    payment_link: '',
    site_url: '',
    working_hours_start: '08:00',
    working_hours_end: '22:00',
    auto_reply_delay_seconds: 5,
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_ai_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setConfig({
          id: data.id,
          is_active: data.is_active ?? false,
          system_prompt: data.system_prompt || '',
          video_url: data.video_url || '',
          payment_link: data.payment_link || '',
          site_url: data.site_url || '',
          working_hours_start: data.working_hours_start || '08:00',
          working_hours_end: data.working_hours_end || '22:00',
          auto_reply_delay_seconds: data.auto_reply_delay_seconds || 5,
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config.id) {
        const { error } = await supabase
          .from('whatsapp_ai_config')
          .update({
            is_active: config.is_active,
            system_prompt: config.system_prompt,
            video_url: config.video_url || null,
            payment_link: config.payment_link || null,
            site_url: config.site_url || null,
            working_hours_start: config.working_hours_start,
            working_hours_end: config.working_hours_end,
            auto_reply_delay_seconds: config.auto_reply_delay_seconds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('whatsapp_ai_config')
          .insert({
            is_active: config.is_active,
            system_prompt: config.system_prompt || 'Você é um assistente de vendas.',
            video_url: config.video_url || null,
            payment_link: config.payment_link || null,
            site_url: config.site_url || null,
            working_hours_start: config.working_hours_start,
            working_hours_end: config.working_hours_end,
            auto_reply_delay_seconds: config.auto_reply_delay_seconds,
          })
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      toast({
        title: 'Configuração salva!',
        description: 'As configurações do agente IA foram atualizadas.',
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuração do Agente IA</h1>
            <p className="text-muted-foreground">Configure o comportamento do assistente virtual</p>
          </div>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5" />
                <div>
                  <CardTitle>Agente IA</CardTitle>
                  <CardDescription>Ative ou desative respostas automáticas</CardDescription>
                </div>
              </div>
              <Switch
                checked={config.is_active}
                onCheckedChange={(checked) => setConfig(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </CardHeader>
        </Card>

        {/* System Prompt */}
        <Card>
          <CardHeader>
            <CardTitle>Prompt do Sistema</CardTitle>
            <CardDescription>
              Instruções que definem a personalidade e comportamento do agente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Você é um assistente de vendas amigável..."
              value={config.system_prompt}
              onChange={(e) => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
              rows={8}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>

        {/* URLs */}
        <Card>
          <CardHeader>
            <CardTitle>Links de Conversão</CardTitle>
            <CardDescription>
              URLs que o agente pode enviar durante a conversa
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                URL do Vídeo
              </Label>
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={config.video_url}
                onChange={(e) => setConfig(prev => ({ ...prev, video_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Enviado quando o lead demonstra interesse inicial
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                URL do Site/Página de Vendas
              </Label>
              <Input
                placeholder="https://seusite.com/oferta"
                value={config.site_url}
                onChange={(e) => setConfig(prev => ({ ...prev, site_url: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Enviado quando o lead quer comprar
              </p>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                Link de Pagamento
              </Label>
              <Input
                placeholder="https://pay.seusite.com/checkout"
                value={config.payment_link}
                onChange={(e) => setConfig(prev => ({ ...prev, payment_link: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Timing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Configurações de Tempo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Horário de Início</Label>
                <Input
                  type="time"
                  value={config.working_hours_start}
                  onChange={(e) => setConfig(prev => ({ ...prev, working_hours_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Horário de Término</Label>
                <Input
                  type="time"
                  value={config.working_hours_end}
                  onChange={(e) => setConfig(prev => ({ ...prev, working_hours_end: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Delay de Resposta</Label>
                <span className="text-sm text-muted-foreground">
                  {config.auto_reply_delay_seconds} segundos
                </span>
              </div>
              <Slider
                value={[config.auto_reply_delay_seconds || 5]}
                onValueChange={([value]) => setConfig(prev => ({ ...prev, auto_reply_delay_seconds: value }))}
                min={1}
                max={30}
                step={1}
              />
              <p className="text-xs text-muted-foreground">
                Tempo de espera antes de enviar a resposta automática
              </p>
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

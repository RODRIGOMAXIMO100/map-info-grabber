import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Bot, Clock, User, FileText, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AIConfig {
  id: string;
  is_active: boolean;
  auto_reply_delay_seconds: number;
  system_prompt: string;
  persona_name: string;
  offer_description: string;
  target_audience: string;
  tone: string;
  video_url: string;
  site_url: string;
  payment_link: string;
}

const TONES = [
  { value: 'profissional', label: 'Profissional', description: 'Formal e corporativo' },
  { value: 'amigavel', label: 'Amigável', description: 'Casual e próximo' },
  { value: 'entusiasta', label: 'Entusiasta', description: 'Energético e motivador' },
  { value: 'consultivo', label: 'Consultivo', description: 'Orientador e didático' },
];

export default function AIConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [config, setConfig] = useState<AIConfig>({
    id: '',
    is_active: false,
    auto_reply_delay_seconds: 5,
    system_prompt: '',
    persona_name: '',
    offer_description: '',
    target_audience: '',
    tone: 'profissional',
    video_url: '',
    site_url: '',
    payment_link: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
          auto_reply_delay_seconds: data.auto_reply_delay_seconds || 5,
          system_prompt: data.system_prompt || '',
          persona_name: data.persona_name || '',
          offer_description: data.offer_description || '',
          target_audience: data.target_audience || '',
          tone: data.tone || 'profissional',
          video_url: data.video_url || '',
          site_url: data.site_url || '',
          payment_link: data.payment_link || '',
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
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
            auto_reply_delay_seconds: config.auto_reply_delay_seconds,
            system_prompt: config.system_prompt,
            persona_name: config.persona_name || null,
            offer_description: config.offer_description || null,
            target_audience: config.target_audience || null,
            tone: config.tone || 'profissional',
            video_url: config.video_url || null,
            site_url: config.site_url || null,
            payment_link: config.payment_link || null,
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
            auto_reply_delay_seconds: config.auto_reply_delay_seconds,
            persona_name: config.persona_name || null,
            offer_description: config.offer_description || null,
            target_audience: config.target_audience || null,
            tone: config.tone || 'profissional',
            video_url: config.video_url || null,
            site_url: config.site_url || null,
            payment_link: config.payment_link || null,
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configuração do Agente IA</h1>
            <p className="text-muted-foreground">Configure o comportamento e identidade do assistente virtual</p>
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

        <Tabs defaultValue="identity" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="offer">Oferta</TabsTrigger>
            <TabsTrigger value="materials">Materiais</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          {/* Identidade */}
          <TabsContent value="identity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Identidade do Agente
                </CardTitle>
                <CardDescription>
                  Defina a persona que o agente irá assumir nas conversas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="persona_name">Nome da Persona</Label>
                  <Input
                    id="persona_name"
                    placeholder="Ex: Rodrigo da Vijay"
                    value={config.persona_name}
                    onChange={(e) => setConfig(prev => ({ ...prev, persona_name: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    O nome que o agente usará para se apresentar
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tone">Tom de Voz</Label>
                  <Select
                    value={config.tone}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, tone: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tom de voz" />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((tone) => (
                        <SelectItem key={tone.value} value={tone.value}>
                          <div className="flex flex-col">
                            <span>{tone.label}</span>
                            <span className="text-xs text-muted-foreground">{tone.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target_audience">Público-Alvo</Label>
                  <Textarea
                    id="target_audience"
                    placeholder="Ex: Empresários e gestores que querem aumentar suas vendas..."
                    value={config.target_audience}
                    onChange={(e) => setConfig(prev => ({ ...prev, target_audience: e.target.value }))}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Oferta */}
          <TabsContent value="offer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Descrição da Oferta
                </CardTitle>
                <CardDescription>
                  Descreva o produto ou serviço que o agente irá apresentar
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="offer_description">Descrição Completa</Label>
                  <Textarea
                    id="offer_description"
                    placeholder="Descreva sua oferta em detalhes. Inclua benefícios, diferenciais, metodologia, etc."
                    value={config.offer_description}
                    onChange={(e) => setConfig(prev => ({ ...prev, offer_description: e.target.value }))}
                    rows={8}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="system_prompt">Prompt do Sistema (Avançado)</Label>
                  <Textarea
                    id="system_prompt"
                    placeholder="Instruções detalhadas para o comportamento da IA..."
                    value={config.system_prompt}
                    onChange={(e) => setConfig(prev => ({ ...prev, system_prompt: e.target.value }))}
                    rows={10}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Usado como fallback quando não há prompt de fase configurado
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Materiais */}
          <TabsContent value="materials" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Links e Materiais
                </CardTitle>
                <CardDescription>
                  URLs que o agente pode enviar durante a conversa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="video_url">Link do Vídeo de Apresentação</Label>
                  <Input
                    id="video_url"
                    type="url"
                    placeholder="https://..."
                    value={config.video_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, video_url: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviado quando o lead mostra interesse inicial
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="site_url">Link do Site/Landing Page</Label>
                  <Input
                    id="site_url"
                    type="url"
                    placeholder="https://..."
                    value={config.site_url}
                    onChange={(e) => setConfig(prev => ({ ...prev, site_url: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviado quando o lead quer saber mais sobre o produto
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_link">Link de Pagamento</Label>
                  <Input
                    id="payment_link"
                    type="url"
                    placeholder="https://..."
                    value={config.payment_link}
                    onChange={(e) => setConfig(prev => ({ ...prev, payment_link: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enviado apenas na fase de conversão, quando o lead está pronto para comprar
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configurações */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Delay de Resposta
                </CardTitle>
                <CardDescription>
                  Tempo de espera antes de enviar a resposta automática
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Tempo de espera</Label>
                  <span className="text-sm font-medium">
                    {config.auto_reply_delay_seconds} segundos
                  </span>
                </div>
                <Slider
                  value={[config.auto_reply_delay_seconds]}
                  onValueChange={([value]) => setConfig(prev => ({ ...prev, auto_reply_delay_seconds: value }))}
                  min={1}
                  max={30}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Simula tempo de digitação para parecer mais natural
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Bot, Clock, User, FileText, Link, FlaskConical, Target, MessageSquare, Sparkles } from 'lucide-react';
import FunnelTester from '@/components/ai/FunnelTester';
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
import { Badge } from '@/components/ui/badge';

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
  // Novos campos do roteiro SDR
  elevator_pitch: string;
  value_proposition: string;
  differentiator: string;
  typical_results: string;
  qualification_questions: string[];
  max_chars_per_stage: Record<string, number>;
}

const TONES = [
  { value: 'profissional', label: 'Profissional', description: 'Formal e corporativo' },
  { value: 'amigavel', label: 'Amigável', description: 'Casual e próximo' },
  { value: 'entusiasta', label: 'Entusiasta', description: 'Energético e motivador' },
  { value: 'consultivo', label: 'Consultivo', description: 'Orientador e didático' },
];

const DEFAULT_MAX_CHARS = {
  STAGE_1: 250,
  STAGE_2: 200,
  STAGE_3: 400,
  STAGE_4: 350,
  STAGE_5: 200,
};

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
    // Roteiro SDR
    elevator_pitch: '',
    value_proposition: '',
    differentiator: '',
    typical_results: '',
    qualification_questions: ['', '', ''],
    max_chars_per_stage: DEFAULT_MAX_CHARS,
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
        // Garantir que qualification_questions seja um array de strings
        let rawQuestions = data.qualification_questions;
        let qualificationQuestions: string[] = ['', '', ''];
        
        if (Array.isArray(rawQuestions)) {
          qualificationQuestions = rawQuestions.map(q => 
            typeof q === 'string' ? q : (q && typeof q === 'object' ? String(q) : '')
          );
        }
        
        // Garantir que sempre tenha 3 perguntas
        while (qualificationQuestions.length < 3) {
          qualificationQuestions.push('');
        }

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
          // Roteiro SDR
          elevator_pitch: (data as any).elevator_pitch || '',
          value_proposition: (data as any).value_proposition || '',
          differentiator: (data as any).differentiator || '',
          typical_results: (data as any).typical_results || '',
          qualification_questions: qualificationQuestions as string[],
          max_chars_per_stage: ((data as any).max_chars_per_stage || DEFAULT_MAX_CHARS) as Record<string, number>,
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
      // Filtrar perguntas vazias
      const filteredQuestions = config.qualification_questions.filter(q => q.trim() !== '');

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
            // Roteiro SDR
            elevator_pitch: config.elevator_pitch || null,
            value_proposition: config.value_proposition || null,
            differentiator: config.differentiator || null,
            typical_results: config.typical_results || null,
            qualification_questions: filteredQuestions,
            max_chars_per_stage: config.max_chars_per_stage,
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
            // Roteiro SDR
            elevator_pitch: config.elevator_pitch || null,
            value_proposition: config.value_proposition || null,
            differentiator: config.differentiator || null,
            typical_results: config.typical_results || null,
            qualification_questions: filteredQuestions,
            max_chars_per_stage: config.max_chars_per_stage,
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

  const updateQualificationQuestion = (index: number, value: string) => {
    setConfig(prev => {
      const newQuestions = [...prev.qualification_questions];
      newQuestions[index] = value;
      return { ...prev, qualification_questions: newQuestions };
    });
  };

  const isRoteiroCompleto = () => {
    return config.elevator_pitch.trim() !== '' && 
           config.value_proposition.trim() !== '' &&
           config.qualification_questions.some(q => q.trim() !== '');
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
              <div className="flex items-center gap-3">
                {isRoteiroCompleto() ? (
                  <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Roteiro Completo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
                    Roteiro Incompleto
                  </Badge>
                )}
                <Switch
                  checked={config.is_active}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>
          </CardHeader>
        </Card>

        <Tabs defaultValue="roteiro" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="roteiro" className="gap-1">
              <Target className="h-3 w-3" />
              Roteiro SDR
            </TabsTrigger>
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="offer">Oferta</TabsTrigger>
            <TabsTrigger value="materials">Materiais</TabsTrigger>
            <TabsTrigger value="settings">Config</TabsTrigger>
            <TabsTrigger value="test" className="gap-1">
              <FlaskConical className="h-3 w-3" />
              Testar
            </TabsTrigger>
          </TabsList>

          {/* ROTEIRO SDR - Nova aba principal */}
          <TabsContent value="roteiro" className="space-y-4">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  Roteiro do SDR
                </CardTitle>
                <CardDescription>
                  Defina o roteiro que o agente seguirá para qualificar leads. <strong>Campos obrigatórios</strong> garantem que o SDR entregue valor antes de propor reunião.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Elevator Pitch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="elevator_pitch" className="flex items-center gap-2">
                      Elevator Pitch
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {config.elevator_pitch.length}/100 caracteres
                    </span>
                  </div>
                  <Input
                    id="elevator_pitch"
                    placeholder="Ex: Ajudo empresas a dobrar a captação de leads em 90 dias"
                    value={config.elevator_pitch}
                    onChange={(e) => setConfig(prev => ({ ...prev, elevator_pitch: e.target.value.slice(0, 100) }))}
                    className={!config.elevator_pitch ? 'border-yellow-500/50' : 'border-green-500/50'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uma frase curta e impactante que resume seu valor. Será usada na apresentação inicial.
                  </p>
                </div>

                {/* Value Proposition */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="value_proposition" className="flex items-center gap-2">
                      Proposta de Valor
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {config.value_proposition.length}/300 caracteres
                    </span>
                  </div>
                  <Textarea
                    id="value_proposition"
                    placeholder="Ex: Trabalhamos com estratégias de marketing digital e vendas estruturadas. Nossos clientes geralmente aumentam a demanda qualificada em 2-3x através de um processo comprovado de geração de leads."
                    value={config.value_proposition}
                    onChange={(e) => setConfig(prev => ({ ...prev, value_proposition: e.target.value.slice(0, 300) }))}
                    rows={3}
                    className={!config.value_proposition ? 'border-yellow-500/50' : 'border-green-500/50'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Explicação de 2-3 frases do que você faz e como ajuda clientes.
                  </p>
                </div>

                {/* Differentiator */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="differentiator">Diferencial</Label>
                    <span className="text-xs text-muted-foreground">
                      {config.differentiator.length}/200 caracteres
                    </span>
                  </div>
                  <Textarea
                    id="differentiator"
                    placeholder="Ex: Diferente de agências tradicionais, focamos em resultado mensurável com processo comprovado e acompanhamento semanal."
                    value={config.differentiator}
                    onChange={(e) => setConfig(prev => ({ ...prev, differentiator: e.target.value.slice(0, 200) }))}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    O que diferencia você da concorrência.
                  </p>
                </div>

                {/* Typical Results */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="typical_results">Resultados Típicos</Label>
                    <span className="text-xs text-muted-foreground">
                      {config.typical_results.length}/200 caracteres
                    </span>
                  </div>
                  <Textarea
                    id="typical_results"
                    placeholder="Ex: Clientes como agências de marketing geralmente dobram os leads qualificados em 3 meses."
                    value={config.typical_results}
                    onChange={(e) => setConfig(prev => ({ ...prev, typical_results: e.target.value.slice(0, 200) }))}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">
                    Resultados concretos que clientes geralmente alcançam.
                  </p>
                </div>

                {/* Qualification Questions */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Perguntas de Qualificação
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Mín. 1</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Perguntas que o SDR usará para descobrir as dores do lead antes de propor reunião.
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-4">1.</span>
                      <Input
                        placeholder="Ex: Qual o maior desafio hoje pra captar clientes?"
                        value={config.qualification_questions[0] || ''}
                        onChange={(e) => updateQualificationQuestion(0, e.target.value)}
                        className={!config.qualification_questions[0] ? 'border-yellow-500/50' : 'border-green-500/50'}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-4">2.</span>
                      <Input
                        placeholder="Ex: Vocês já tentaram alguma estratégia de marketing digital?"
                        value={config.qualification_questions[1] || ''}
                        onChange={(e) => updateQualificationQuestion(1, e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-4">3.</span>
                      <Input
                        placeholder="Ex: Tem uma meta de vendas definida pro próximo trimestre?"
                        value={config.qualification_questions[2] || ''}
                        onChange={(e) => updateQualificationQuestion(2, e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview do Fluxo */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Preview do Fluxo SDR</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">1</Badge>
                  <div>
                    <strong>Apresentação:</strong> "{config.persona_name || '[Nome]'}, da [Empresa]. {config.elevator_pitch || '[Elevator Pitch]'}. Com o que você trabalha?"
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">2</Badge>
                  <div>
                    <strong>Qualificação:</strong> "Legal, [área]! {config.qualification_questions[0] || '[Pergunta de qualificação]'}"
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">3</Badge>
                  <div>
                    <strong>Valor:</strong> "Entendi, [dor] é exatamente o que a gente resolve. {config.value_proposition || '[Proposta de valor]'}. {config.differentiator || ''} Faz sentido eu explicar como funcionaria pro seu caso?"
                  </div>
                </div>
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">4</Badge>
                  <div>
                    <strong>CTA:</strong> "Resumindo: você precisa [dor] e quer [objetivo]. {config.typical_results || '[Resultados típicos]'}. Que tal agendarmos uma conversa de 20min?"
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

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

          {/* Testar Funil */}
          <TabsContent value="test" className="space-y-4">
            <FunnelTester />
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

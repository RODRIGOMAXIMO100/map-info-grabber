import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Dna, Link, Video, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface DNAForm {
  name: string;
  description: string;
  persona_name: string;
  target_audience: string;
  offer_description: string;
  system_prompt: string;
  video_url: string;
  site_url: string;
  payment_link: string;
  tone: string;
  is_active: boolean;
}

const DEFAULT_PROMPT = `Você é o SDR (Sales Development Representative) da empresa.

## SEU PAPEL
- Você é o PRIMEIRO CONTATO - não é vendedor, é qualificador
- Seu objetivo é QUALIFICAR leads usando BANT e mover pelo funil
- NUNCA discuta preços exatos ou fechamento

## CRITÉRIOS BANT
- Budget: Tem orçamento disponível?
- Authority: É decisor ou influenciador?
- Need: Qual a necessidade específica?
- Timing: Quando precisa resolver?

## TOM E ESTILO
- Profissional mas próximo
- Use emojis com moderação (1-2 por mensagem)
- Respostas objetivas (max 400 caracteres)`;

const TONES = [
  { value: 'profissional', label: '👔 Profissional', description: 'Formal e corporativo' },
  { value: 'descontraido', label: '😊 Descontraído', description: 'Amigável e leve' },
  { value: 'tecnico', label: '🔬 Técnico', description: 'Especialista e detalhista' },
  { value: 'consultivo', label: '💼 Consultivo', description: 'Orientado a soluções' },
];

export default function DNAEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const isNew = id === 'new';
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<DNAForm>({
    name: '',
    description: '',
    persona_name: '',
    target_audience: '',
    offer_description: '',
    system_prompt: DEFAULT_PROMPT,
    video_url: '',
    site_url: '',
    payment_link: '',
    tone: 'profissional',
    is_active: true,
  });

  useEffect(() => {
    if (!isNew && id) {
      loadDna(id);
    }
  }, [id, isNew]);

  const loadDna = async (dnaId: string) => {
    const { data, error } = await supabase
      .from('ai_dnas')
      .select('*')
      .eq('id', dnaId)
      .single();

    if (error || !data) {
      toast({ title: 'DNA não encontrado', variant: 'destructive' });
      navigate('/dnas');
      return;
    }

    setForm({
      name: data.name || '',
      description: data.description || '',
      persona_name: data.persona_name || '',
      target_audience: data.target_audience || '',
      offer_description: data.offer_description || '',
      system_prompt: data.system_prompt || DEFAULT_PROMPT,
      video_url: data.video_url || '',
      site_url: data.site_url || '',
      payment_link: data.payment_link || '',
      tone: data.tone || 'profissional',
      is_active: data.is_active ?? true,
    });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    if (!form.system_prompt.trim()) {
      toast({ title: 'Prompt do sistema é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from('ai_dnas').insert({
          name: form.name,
          description: form.description || null,
          persona_name: form.persona_name || null,
          target_audience: form.target_audience || null,
          offer_description: form.offer_description || null,
          system_prompt: form.system_prompt,
          video_url: form.video_url || null,
          site_url: form.site_url || null,
          payment_link: form.payment_link || null,
          tone: form.tone,
          is_active: form.is_active,
        });

        if (error) throw error;
        toast({ title: 'DNA criado com sucesso!' });
      } else {
        const { error } = await supabase
          .from('ai_dnas')
          .update({
            name: form.name,
            description: form.description || null,
            persona_name: form.persona_name || null,
            target_audience: form.target_audience || null,
            offer_description: form.offer_description || null,
            system_prompt: form.system_prompt,
            video_url: form.video_url || null,
            site_url: form.site_url || null,
            payment_link: form.payment_link || null,
            tone: form.tone,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
        toast({ title: 'DNA atualizado!' });
      }
      navigate('/dnas');
    } catch (error) {
      console.error('Error saving DNA:', error);
      toast({ title: 'Erro ao salvar DNA', variant: 'destructive' });
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dnas')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Dna className="h-6 w-6 text-primary" />
                {isNew ? 'Novo DNA' : 'Editar DNA'}
              </h1>
              <p className="text-muted-foreground">
                Configure a persona e prompt para este DNA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label>Ativo</Label>
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>

        <Tabs defaultValue="basic" className="space-y-6">
          <TabsList>
            <TabsTrigger value="basic">Informações Básicas</TabsTrigger>
            <TabsTrigger value="prompt">Prompt do Sistema</TabsTrigger>
            <TabsTrigger value="materials">Materiais</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card>
              <CardHeader>
                <CardTitle>Informações do DNA</CardTitle>
                <CardDescription>
                  Defina a identidade e características deste DNA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome do DNA *</Label>
                    <Input
                      id="name"
                      placeholder="Ex: DNA Indústrias"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="persona">Nome da Persona</Label>
                    <Input
                      id="persona"
                      placeholder="Ex: Carlos da Vijay"
                      value={form.persona_name}
                      onChange={(e) => setForm({ ...form, persona_name: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Input
                    id="description"
                    placeholder="Descrição breve do DNA"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="audience">Público-Alvo</Label>
                    <Input
                      id="audience"
                      placeholder="Ex: Donos de indústrias metalúrgicas"
                      value={form.target_audience}
                      onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tone">Tom de Voz</Label>
                    <Select
                      value={form.tone}
                      onValueChange={(value) => setForm({ ...form, tone: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TONES.map((tone) => (
                          <SelectItem key={tone.value} value={tone.value}>
                            <div>
                              <span>{tone.label}</span>
                              <span className="text-muted-foreground text-xs ml-2">
                                {tone.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer">Descrição da Oferta</Label>
                  <Textarea
                    id="offer"
                    placeholder="Descreva o que está sendo oferecido neste DNA..."
                    value={form.offer_description}
                    onChange={(e) => setForm({ ...form, offer_description: e.target.value })}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prompt">
            <Card>
              <CardHeader>
                <CardTitle>Prompt do Sistema</CardTitle>
                <CardDescription>
                  Este é o prompt que define o comportamento da IA nas conversas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Defina o prompt do sistema..."
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                  rows={20}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Dica: Use markdown para estruturar melhor o prompt. Inclua informações sobre a empresa,
                  regras de qualificação, tom de voz e materiais disponíveis.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="materials">
            <Card>
              <CardHeader>
                <CardTitle>Materiais e Links</CardTitle>
                <CardDescription>
                  URLs específicas que a IA pode enviar durante as conversas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="video" className="flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    URL do Vídeo
                  </Label>
                  <Input
                    id="video"
                    type="url"
                    placeholder="https://youtube.com/..."
                    value={form.video_url}
                    onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Vídeo de apresentação ou demonstração
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="site" className="flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    URL do Site / Landing Page
                  </Label>
                  <Input
                    id="site"
                    type="url"
                    placeholder="https://seusite.com.br"
                    value={form.site_url}
                    onChange={(e) => setForm({ ...form, site_url: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Site ou landing page específica para este DNA
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment" className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Link de Pagamento
                  </Label>
                  <Input
                    id="payment"
                    type="url"
                    placeholder="https://pag.ae/..."
                    value={form.payment_link}
                    onChange={(e) => setForm({ ...form, payment_link: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Link para checkout ou pagamento
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

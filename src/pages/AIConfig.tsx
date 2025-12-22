import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Bot, Clock, Dna } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
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
  default_dna_id: string | null;
}

interface DNAOption {
  id: string;
  name: string;
  persona_name: string | null;
}

export default function AIConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dnas, setDnas] = useState<DNAOption[]>([]);
  
  const [config, setConfig] = useState<AIConfig>({
    id: '',
    is_active: false,
    auto_reply_delay_seconds: 5,
    default_dna_id: null,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load config and DNAs in parallel
      const [configResult, dnasResult] = await Promise.all([
        supabase.from('whatsapp_ai_config').select('*').limit(1).maybeSingle(),
        supabase.from('ai_dnas').select('id, name, persona_name').eq('is_active', true).order('name'),
      ]);

      if (configResult.error) throw configResult.error;
      if (dnasResult.error) throw dnasResult.error;

      if (configResult.data) {
        setConfig({
          id: configResult.data.id,
          is_active: configResult.data.is_active ?? false,
          auto_reply_delay_seconds: configResult.data.auto_reply_delay_seconds || 5,
          default_dna_id: configResult.data.default_dna_id || null,
        });
      }

      setDnas(dnasResult.data || []);
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
            default_dna_id: config.default_dna_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('whatsapp_ai_config')
          .insert({
            is_active: config.is_active,
            system_prompt: 'Você é um assistente de vendas.',
            auto_reply_delay_seconds: config.auto_reply_delay_seconds,
            default_dna_id: config.default_dna_id,
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

  const selectedDna = dnas.find(d => d.id === config.default_dna_id);

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

        {/* DNA Padrão */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dna className="h-5 w-5" />
              DNA Padrão
            </CardTitle>
            <CardDescription>
              Selecione o DNA que será usado quando uma conversa não tiver um DNA específico atribuído
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select
              value={config.default_dna_id || 'none'}
              onValueChange={(value) => setConfig(prev => ({ 
                ...prev, 
                default_dna_id: value === 'none' ? null : value 
              }))}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Selecione um DNA padrão" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">Nenhum DNA padrão</span>
                </SelectItem>
                {dnas.map((dna) => (
                  <SelectItem key={dna.id} value={dna.id}>
                    <div className="flex items-center gap-2">
                      <span>{dna.name}</span>
                      {dna.persona_name && (
                        <span className="text-muted-foreground text-sm">
                          ({dna.persona_name})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {dnas.length === 0 && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
                Nenhum DNA ativo encontrado. 
                <Button 
                  variant="link" 
                  className="px-1 h-auto" 
                  onClick={() => navigate('/dnas/new')}
                >
                  Crie um DNA
                </Button>
                para começar.
              </div>
            )}

            {selectedDna && (
              <div className="text-sm text-muted-foreground">
                O DNA "{selectedDna.name}" será usado como personalidade padrão do agente.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timing */}
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

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}

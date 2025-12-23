import { useState, useEffect } from 'react';
import { 
  Layers, 
  Save, 
  RotateCcw, 
  ChevronDown, 
  ChevronUp,
  Target,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Sparkles
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface StagePrompt {
  id: string;
  stage_id: string;
  stage_name: string;
  objective: string;
  system_prompt: string;
  max_messages_in_stage: number;
  success_criteria: string | null;
  failure_criteria: string | null;
  is_active: boolean;
  dna_id: string | null;
}

const STAGE_COLORS: Record<string, string> = {
  'STAGE_1': 'bg-blue-500',
  'STAGE_2': 'bg-cyan-500',
  'STAGE_3': 'bg-violet-500',
  'STAGE_4': 'bg-amber-500',
  'STAGE_5': 'bg-emerald-500',
};

const STAGE_ICONS: Record<string, string> = {
  'STAGE_1': '👋',
  'STAGE_2': '🔍',
  'STAGE_3': '💡',
  'STAGE_4': '📋',
  'STAGE_5': '🤝',
};

export default function FunnelStagesManager() {
  const { toast } = useToast();
  const [stages, setStages] = useState<StagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<string[]>(['STAGE_1']);
  const [editedStages, setEditedStages] = useState<Record<string, Partial<StagePrompt>>>({});

  useEffect(() => {
    loadStages();
  }, []);

  const loadStages = async () => {
    const { data, error } = await supabase
      .from('ai_stage_prompts')
      .select('*')
      .is('dna_id', null) // Pegar apenas os prompts globais (sem DNA específico)
      .order('stage_id', { ascending: true });

    if (error) {
      console.error('Error loading stages:', error);
      toast({ title: 'Erro ao carregar fases', variant: 'destructive' });
    } else {
      setStages(data || []);
    }
    setLoading(false);
  };

  const toggleExpanded = (stageId: string) => {
    setExpandedStages(prev => 
      prev.includes(stageId) 
        ? prev.filter(id => id !== stageId)
        : [...prev, stageId]
    );
  };

  const handleFieldChange = (stageId: string, field: keyof StagePrompt, value: string | number | boolean) => {
    setEditedStages(prev => ({
      ...prev,
      [stageId]: {
        ...prev[stageId],
        [field]: value
      }
    }));
  };

  const getFieldValue = (stage: StagePrompt, field: keyof StagePrompt) => {
    if (editedStages[stage.stage_id]?.[field] !== undefined) {
      return editedStages[stage.stage_id][field];
    }
    return stage[field];
  };

  const hasChanges = (stageId: string) => {
    return Object.keys(editedStages[stageId] || {}).length > 0;
  };

  const saveStage = async (stage: StagePrompt) => {
    const changes = editedStages[stage.stage_id];
    if (!changes || Object.keys(changes).length === 0) return;

    setSaving(stage.stage_id);

    const { error } = await supabase
      .from('ai_stage_prompts')
      .update({
        ...changes,
        updated_at: new Date().toISOString()
      })
      .eq('id', stage.id);

    if (error) {
      console.error('Error saving stage:', error);
      toast({ title: 'Erro ao salvar fase', variant: 'destructive' });
    } else {
      toast({ title: `Fase "${stage.stage_name}" salva!` });
      // Limpar edições e recarregar
      setEditedStages(prev => {
        const { [stage.stage_id]: _, ...rest } = prev;
        return rest;
      });
      loadStages();
    }

    setSaving(null);
  };

  const resetStage = (stageId: string) => {
    setEditedStages(prev => {
      const { [stageId]: _, ...rest } = prev;
      return rest;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Fases do Funil IA
            </h1>
            <p className="text-muted-foreground">
              Configure os prompts e objetivos de cada fase do atendimento
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="bg-muted/50 border-dashed">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Como funciona?</p>
                <p className="text-muted-foreground">
                  A IA usa prompts específicos para cada fase do funil. Quando o lead avança de fase, 
                  o comportamento da IA muda automaticamente para atender aos objetivos daquela etapa.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stages List */}
        <div className="space-y-4">
          {stages.map((stage, index) => (
            <Collapsible
              key={stage.id}
              open={expandedStages.includes(stage.stage_id)}
              onOpenChange={() => toggleExpanded(stage.stage_id)}
            >
              <Card className={`transition-all ${hasChanges(stage.stage_id) ? 'ring-2 ring-primary/50' : ''}`}>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-10 w-10 rounded-lg ${STAGE_COLORS[stage.stage_id]} flex items-center justify-center text-white text-lg`}>
                          {STAGE_ICONS[stage.stage_id] || index + 1}
                        </div>
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            Fase {index + 1}: {stage.stage_name}
                            {!stage.is_active && (
                              <Badge variant="secondary" className="text-xs">Inativa</Badge>
                            )}
                            {hasChanges(stage.stage_id) && (
                              <Badge variant="outline" className="text-xs border-primary text-primary">
                                Modificado
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {stage.objective}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {stage.max_messages_in_stage} msgs
                        </Badge>
                        {expandedStages.includes(stage.stage_id) ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="space-y-6 pt-0">
                    {/* Active Toggle */}
                    <div className="flex items-center justify-between py-2 border-t">
                      <div>
                        <Label>Fase Ativa</Label>
                        <p className="text-xs text-muted-foreground">
                          Desativar faz a IA pular esta fase
                        </p>
                      </div>
                      <Switch
                        checked={getFieldValue(stage, 'is_active') as boolean}
                        onCheckedChange={(checked) => handleFieldChange(stage.stage_id, 'is_active', checked)}
                      />
                    </div>

                    {/* Objective */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Objetivo da Fase
                      </Label>
                      <Input
                        value={getFieldValue(stage, 'objective') as string}
                        onChange={(e) => handleFieldChange(stage.stage_id, 'objective', e.target.value)}
                        placeholder="Ex: Despertar curiosidade e gerar engajamento inicial"
                      />
                    </div>

                    {/* Max Messages */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Máximo de Mensagens nesta Fase
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={getFieldValue(stage, 'max_messages_in_stage') as number}
                        onChange={(e) => handleFieldChange(stage.stage_id, 'max_messages_in_stage', parseInt(e.target.value) || 5)}
                        className="w-32"
                      />
                      <p className="text-xs text-muted-foreground">
                        A IA avançará automaticamente após este número de mensagens
                      </p>
                    </div>

                    {/* Success Criteria */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Critério de Sucesso
                      </Label>
                      <Textarea
                        value={getFieldValue(stage, 'success_criteria') as string || ''}
                        onChange={(e) => handleFieldChange(stage.stage_id, 'success_criteria', e.target.value)}
                        placeholder="Quando o lead demonstrar interesse claro, perguntar sobre necessidades, etc."
                        rows={2}
                      />
                    </div>

                    {/* Failure Criteria */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
                        Critério de Falha
                      </Label>
                      <Textarea
                        value={getFieldValue(stage, 'failure_criteria') as string || ''}
                        onChange={(e) => handleFieldChange(stage.stage_id, 'failure_criteria', e.target.value)}
                        placeholder="Respostas negativas persistentes, pedidos de descadastro, etc."
                        rows={2}
                      />
                    </div>

                    {/* System Prompt */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        System Prompt
                      </Label>
                      <Textarea
                        value={getFieldValue(stage, 'system_prompt') as string}
                        onChange={(e) => handleFieldChange(stage.stage_id, 'system_prompt', e.target.value)}
                        placeholder="Instruções detalhadas para a IA nesta fase..."
                        rows={8}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Este prompt substitui o prompt principal quando o lead está nesta fase
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-4 border-t">
                      <Button
                        onClick={() => saveStage(stage)}
                        disabled={!hasChanges(stage.stage_id) || saving === stage.stage_id}
                        className="gap-2"
                      >
                        {saving === stage.stage_id ? (
                          <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar Alterações
                      </Button>
                      {hasChanges(stage.stage_id) && (
                        <Button
                          variant="outline"
                          onClick={() => resetStage(stage.stage_id)}
                          className="gap-2"
                        >
                          <RotateCcw className="h-4 w-4" />
                          Descartar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>

        {stages.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Layers className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">Nenhuma fase configurada</h3>
              <p className="text-muted-foreground text-center">
                As fases do funil serão criadas automaticamente ao configurar o sistema de IA
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

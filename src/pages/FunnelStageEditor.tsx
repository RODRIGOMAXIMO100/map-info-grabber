import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, GripVertical, Bot, User, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { CRMFunnel, CRMFunnelStage } from '@/types/crm';

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#ef4444', // red
  '#22c55e', // green
  '#ec4899', // pink
  '#6366f1', // indigo
  '#84cc16', // lime
];

export default function FunnelStageEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [funnel, setFunnel] = useState<CRMFunnel | null>(null);
  const [funnelName, setFunnelName] = useState('');
  const [funnelDescription, setFunnelDescription] = useState('');
  const [stages, setStages] = useState<CRMFunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<CRMFunnelStage | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (id) loadFunnelAndStages();
  }, [id]);

  const loadFunnelAndStages = async () => {
    try {
      const [funnelResult, stagesResult] = await Promise.all([
        supabase.from('crm_funnels').select('*').eq('id', id).single(),
        supabase.from('crm_funnel_stages').select('*').eq('funnel_id', id).order('stage_order', { ascending: true }),
      ]);

      if (funnelResult.error) throw funnelResult.error;
      if (stagesResult.error) throw stagesResult.error;

      setFunnel(funnelResult.data);
      setFunnelName(funnelResult.data.name);
      setFunnelDescription(funnelResult.data.description || '');
      setStages(stagesResult.data || []);
    } catch (error) {
      console.error('Error loading funnel:', error);
      toast({ title: 'Erro ao carregar funil', variant: 'destructive' });
      navigate('/crm/funnels');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStage = async () => {
    if (!id) return;

    const newOrder = stages.length;
    const newStage = {
      funnel_id: id,
      name: `Nova Etapa ${newOrder + 1}`,
      color: PRESET_COLORS[newOrder % PRESET_COLORS.length],
      stage_order: newOrder,
      is_ai_controlled: false,
    };

    try {
      const { data, error } = await supabase
        .from('crm_funnel_stages')
        .insert(newStage)
        .select()
        .single();

      if (error) throw error;

      setStages([...stages, data]);
      toast({ title: 'Etapa adicionada' });
    } catch (error) {
      console.error('Error adding stage:', error);
      toast({ title: 'Erro ao adicionar etapa', variant: 'destructive' });
    }
  };

  const handleUpdateStage = (index: number, field: keyof CRMFunnelStage, value: string | boolean) => {
    const updated = [...stages];
    updated[index] = { ...updated[index], [field]: value };
    setStages(updated);
  };

  const handleSaveAll = async () => {
    if (!funnelName.trim()) {
      toast({ title: 'Nome do funil é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      // Update funnel name and description
      await supabase
        .from('crm_funnels')
        .update({
          name: funnelName.trim(),
          description: funnelDescription.trim() || null,
        })
        .eq('id', id);

      // Update all stages
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await supabase
          .from('crm_funnel_stages')
          .update({
            name: stage.name,
            color: stage.color,
            stage_order: i,
            is_ai_controlled: stage.is_ai_controlled,
          })
          .eq('id', stage.id);
      }

      toast({ title: 'Alterações salvas!' });
    } catch (error) {
      console.error('Error saving stages:', error);
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async () => {
    if (!stageToDelete) return;

    try {
      // Check if stage has leads
      const { count } = await supabase
        .from('whatsapp_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('funnel_stage', stageToDelete.id);

      if (count && count > 0) {
        toast({
          title: 'Não é possível excluir',
          description: `Esta etapa possui ${count} leads. Mova-os antes de excluir.`,
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase
        .from('crm_funnel_stages')
        .delete()
        .eq('id', stageToDelete.id);

      if (error) throw error;

      setStages(stages.filter(s => s.id !== stageToDelete.id));
      toast({ title: 'Etapa removida' });
    } catch (error) {
      console.error('Error deleting stage:', error);
      toast({ title: 'Erro ao excluir etapa', variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setStageToDelete(null);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newStages = [...stages];
    const draggedStage = newStages[draggedIndex];
    newStages.splice(draggedIndex, 1);
    newStages.splice(index, 0, draggedStage);
    setStages(newStages);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!funnel) return null;

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/crm/funnels')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Editar Funil</h1>
            <p className="text-muted-foreground">Edite as informações e etapas do funil</p>
          </div>
        </div>
        <Button onClick={handleSaveAll} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Alterações
        </Button>
      </div>

      {/* Funnel Info Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">📝 Informações do Funil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="funnel-name">Nome do Funil</Label>
            <Input
              id="funnel-name"
              value={funnelName}
              onChange={(e) => setFunnelName(e.target.value)}
              placeholder="Ex: Funil de Aquisição"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="funnel-description">Descrição (opcional)</Label>
            <Textarea
              id="funnel-description"
              value={funnelDescription}
              onChange={(e) => setFunnelDescription(e.target.value)}
              placeholder="Descreva o objetivo deste funil..."
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stages List */}
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <Card
            key={stage.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            className={`cursor-move transition-transform ${draggedIndex === index ? 'opacity-50 scale-[1.02]' : ''}`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                {/* Drag Handle */}
                <div className="cursor-grab active:cursor-grabbing text-muted-foreground">
                  <GripVertical className="h-5 w-5" />
                </div>

                {/* Order Badge */}
                <Badge variant="outline" className="w-8 justify-center">
                  {index + 1}
                </Badge>

                {/* Color Picker */}
                <div className="relative">
                  <input
                    type="color"
                    value={stage.color}
                    onChange={(e) => handleUpdateStage(index, 'color', e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                </div>

                {/* Name Input */}
                <Input
                  value={stage.name}
                  onChange={(e) => handleUpdateStage(index, 'name', e.target.value)}
                  className="flex-1"
                  placeholder="Nome da etapa"
                />

                {/* AI Toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={stage.is_ai_controlled}
                    onCheckedChange={(checked) => handleUpdateStage(index, 'is_ai_controlled', checked)}
                  />
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    {stage.is_ai_controlled ? (
                      <>
                        <Bot className="h-4 w-4" /> IA
                      </>
                    ) : (
                      <>
                        <User className="h-4 w-4" /> Manual
                      </>
                    )}
                  </span>
                </div>

                {/* Delete Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { setStageToDelete(stage); setDeleteDialogOpen(true); }}
                  disabled={stages.length <= 1}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add Stage Button */}
      <Button variant="outline" onClick={handleAddStage} className="w-full gap-2">
        <Plus className="h-4 w-4" />
        Adicionar Etapa
      </Button>

      {/* Preset Colors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Cores Sugeridas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className="w-8 h-8 rounded-full border-2 border-transparent hover:border-foreground/20 transition-colors"
                style={{ backgroundColor: color }}
                onClick={() => {
                  // Copy color to clipboard
                  navigator.clipboard.writeText(color);
                  toast({ title: `Cor ${color} copiada!` });
                }}
                title={`Clique para copiar: ${color}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{stageToDelete?.name}"? 
              Leads nesta etapa precisam ser movidos antes da exclusão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Star, Trash2, Edit, Loader2, GitBranch, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { AssignFunnelUsersModal } from '@/components/crm/AssignFunnelUsersModal';
import type { CRMFunnel } from '@/types/crm';

export default function FunnelManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [funnels, setFunnels] = useState<CRMFunnel[]>([]);
  const [stagesCounts, setStagesCounts] = useState<Record<string, number>>({});
  const [leadsCounts, setLeadsCounts] = useState<Record<string, number>>({});
  const [assignedUsersCounts, setAssignedUsersCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignUsersOpen, setAssignUsersOpen] = useState(false);
  const [selectedFunnel, setSelectedFunnel] = useState<CRMFunnel | null>(null);
  const [funnelToDelete, setFunnelToDelete] = useState<CRMFunnel | null>(null);
  const [newFunnel, setNewFunnel] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFunnels();
  }, []);

  const loadFunnels = async () => {
    try {
      const { data: funnelsData, error: funnelsError } = await supabase
        .from('crm_funnels')
        .select('*')
        .order('created_at', { ascending: true });

      if (funnelsError) throw funnelsError;

      setFunnels(funnelsData || []);

      // Load stages count per funnel
      const { data: stagesData } = await supabase
        .from('crm_funnel_stages')
        .select('funnel_id');

      const counts: Record<string, number> = {};
      stagesData?.forEach(s => {
        counts[s.funnel_id] = (counts[s.funnel_id] || 0) + 1;
      });
      setStagesCounts(counts);

      // Load leads count per funnel
      const { data: leadsData } = await supabase
        .from('whatsapp_conversations')
        .select('crm_funnel_id')
        .eq('is_crm_lead', true);

      const leadCounts: Record<string, number> = {};
      leadsData?.forEach(l => {
        if (l.crm_funnel_id) {
          leadCounts[l.crm_funnel_id] = (leadCounts[l.crm_funnel_id] || 0) + 1;
        }
      });
      setLeadsCounts(leadCounts);

      // Load assigned users count per funnel
      const { data: assignmentsData } = await supabase
        .from('crm_funnel_users')
        .select('funnel_id');

      const assignmentCounts: Record<string, number> = {};
      assignmentsData?.forEach(a => {
        assignmentCounts[a.funnel_id] = (assignmentCounts[a.funnel_id] || 0) + 1;
      });
      setAssignedUsersCounts(assignmentCounts);
    } catch (error) {
      console.error('Error loading funnels:', error);
      toast({ title: 'Erro ao carregar funis', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFunnel = async () => {
    if (!newFunnel.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: funnel, error } = await supabase
        .from('crm_funnels')
        .insert({ name: newFunnel.name.trim(), description: newFunnel.description.trim() || null })
        .select()
        .single();

      if (error) throw error;

      // Create default stages for new funnel
      const defaultStages = [
        { funnel_id: funnel.id, name: 'Novo', color: '#3b82f6', stage_order: 0, is_ai_controlled: true },
        { funnel_id: funnel.id, name: 'Em Andamento', color: '#f59e0b', stage_order: 1, is_ai_controlled: false },
        { funnel_id: funnel.id, name: 'Fechado', color: '#22c55e', stage_order: 2, is_ai_controlled: false },
      ];

      await supabase.from('crm_funnel_stages').insert(defaultStages);

      toast({ title: 'Funil criado com sucesso!' });
      setCreateDialogOpen(false);
      setNewFunnel({ name: '', description: '' });
      loadFunnels();
    } catch (error) {
      console.error('Error creating funnel:', error);
      toast({ title: 'Erro ao criar funil', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (funnel: CRMFunnel) => {
    try {
      // Remove default from all funnels
      await supabase.from('crm_funnels').update({ is_default: false }).neq('id', funnel.id);
      // Set this one as default
      await supabase.from('crm_funnels').update({ is_default: true }).eq('id', funnel.id);

      toast({ title: `${funnel.name} definido como padrão` });
      loadFunnels();
    } catch (error) {
      console.error('Error setting default:', error);
      toast({ title: 'Erro ao definir padrão', variant: 'destructive' });
    }
  };

  const handleDeleteFunnel = async () => {
    if (!funnelToDelete) return;

    try {
      // Check if funnel has leads
      const leadsCount = leadsCounts[funnelToDelete.id] || 0;
      if (leadsCount > 0) {
        toast({ 
          title: 'Não é possível excluir', 
          description: `Este funil possui ${leadsCount} leads. Mova-os antes de excluir.`,
          variant: 'destructive' 
        });
        return;
      }

      // Delete funnel (stages will cascade)
      const { error } = await supabase
        .from('crm_funnels')
        .delete()
        .eq('id', funnelToDelete.id);

      if (error) throw error;

      toast({ title: 'Funil removido' });
      setDeleteDialogOpen(false);
      setFunnelToDelete(null);
      loadFunnels();
    } catch (error) {
      console.error('Error deleting funnel:', error);
      toast({ title: 'Erro ao excluir funil', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gerenciar Funis</h1>
          <p className="text-muted-foreground">Crie e configure múltiplos funis de vendas</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Funil
        </Button>
      </div>

      <div className="grid gap-4">
        {funnels.map((funnel) => (
          <Card key={funnel.id} className={funnel.is_default ? 'ring-2 ring-primary' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{funnel.name}</CardTitle>
                    {funnel.is_default && (
                      <Badge variant="default" className="gap-1">
                        <Star className="h-3 w-3" />
                        Padrão
                      </Badge>
                    )}
                  </div>
                  {funnel.description && (
                    <CardDescription>{funnel.description}</CardDescription>
                  )}
                </div>
                <div className="flex gap-2">
                  {!funnel.is_default && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(funnel)}
                      title="Definir como padrão"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedFunnel(funnel);
                      setAssignUsersOpen(true);
                    }}
                    title="Atribuir usuários"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/crm/funnels/${funnel.id}/edit`)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setFunnelToDelete(funnel); setDeleteDialogOpen(true); }}
                    disabled={funnel.is_default}
                    title={funnel.is_default ? 'Não é possível excluir o funil padrão' : 'Excluir funil'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <GitBranch className="h-4 w-4" />
                  {stagesCounts[funnel.id] || 0} etapas
                </div>
                <div>
                  {leadsCounts[funnel.id] || 0} leads
                </div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {assignedUsersCounts[funnel.id] || 0} usuários
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {funnels.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Nenhum funil criado. Crie seu primeiro funil!</p>
          </Card>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Funil</DialogTitle>
            <DialogDescription>
              Crie um novo funil de vendas. Você poderá editar as etapas depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                placeholder="Ex: Funil B2B"
                value={newFunnel.name}
                onChange={(e) => setNewFunnel({ ...newFunnel, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Descreva o objetivo deste funil..."
                value={newFunnel.description}
                onChange={(e) => setNewFunnel({ ...newFunnel, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateFunnel} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Funil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Funil?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{funnelToDelete?.name}"? Esta ação não pode ser desfeita.
              Todas as etapas serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFunnel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Users Modal */}
      {selectedFunnel && (
        <AssignFunnelUsersModal
          open={assignUsersOpen}
          onOpenChange={setAssignUsersOpen}
          funnelId={selectedFunnel.id}
          funnelName={selectedFunnel.name}
          onSaved={loadFunnels}
        />
      )}
    </div>
  );
}

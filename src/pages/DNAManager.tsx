import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Copy, Dna, MoreVertical, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface DNA {
  id: string;
  name: string;
  description: string | null;
  persona_name: string | null;
  target_audience: string | null;
  tone: string | null;
  is_active: boolean;
  created_at: string;
}

export default function DNAManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [dnas, setDnas] = useState<DNA[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);

  useEffect(() => {
    loadDnas();
    
    const channel = supabase
      .channel('dna-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_dnas' }, () => loadDnas())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadDnas = async () => {
    const { data, error } = await supabase
      .from('ai_dnas')
      .select('id, name, description, persona_name, target_audience, tone, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading DNAs:', error);
      toast({ title: 'Erro ao carregar DNAs', variant: 'destructive' });
    } else {
      setDnas(data || []);
    }
    setLoading(false);
  };

  const duplicateDna = async (dna: DNA) => {
    const { data: fullDna, error: fetchError } = await supabase
      .from('ai_dnas')
      .select('*')
      .eq('id', dna.id)
      .single();

    if (fetchError || !fullDna) {
      toast({ title: 'Erro ao duplicar DNA', variant: 'destructive' });
      return;
    }

    const { id, created_at, updated_at, ...dnaData } = fullDna;
    const { error } = await supabase
      .from('ai_dnas')
      .insert({
        ...dnaData,
        name: `${dnaData.name} (cópia)`,
        is_active: false,
      });

    if (error) {
      toast({ title: 'Erro ao duplicar DNA', variant: 'destructive' });
    } else {
      toast({ title: 'DNA duplicado com sucesso!' });
      loadDnas();
    }
  };

  const toggleActive = async (dna: DNA) => {
    const { error } = await supabase
      .from('ai_dnas')
      .update({ is_active: !dna.is_active, updated_at: new Date().toISOString() })
      .eq('id', dna.id);

    if (error) {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    } else {
      loadDnas();
    }
  };

  const deleteDna = async (id: string) => {
    const { error } = await supabase.from('ai_dnas').delete().eq('id', id);
    
    if (error) {
      toast({ title: 'Erro ao excluir DNA', variant: 'destructive' });
    } else {
      toast({ title: 'DNA excluído!' });
      loadDnas();
    }
    setDeleteDialog(null);
  };

  const getToneLabel = (tone: string | null) => {
    const tones: Record<string, string> = {
      profissional: '👔 Profissional',
      descontraido: '😊 Descontraído',
      tecnico: '🔬 Técnico',
      consultivo: '💼 Consultivo',
    };
    return tones[tone || 'profissional'] || tone;
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
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Dna className="h-6 w-6 text-primary" />
              DNAs do Agente IA
            </h1>
            <p className="text-muted-foreground">
              Configure diferentes personas e prompts para seus disparos
            </p>
          </div>
          <Button onClick={() => navigate('/dnas/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo DNA
          </Button>
        </div>

        {/* DNA Cards */}
        {dnas.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Dna className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">Nenhum DNA criado</h3>
              <p className="text-muted-foreground mb-4 text-center">
                Crie seu primeiro DNA para personalizar as respostas da IA em seus disparos
              </p>
              <Button onClick={() => navigate('/dnas/new')} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeiro DNA
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dnas.map((dna) => (
              <Card key={dna.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {dna.name}
                        {dna.is_active ? (
                          <Badge variant="default" className="text-xs">Ativo</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inativo</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {dna.description || 'Sem descrição'}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/dnas/${dna.id}`)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateDna(dna)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(dna)}>
                          {dna.is_active ? (
                            <>
                              <X className="h-4 w-4 mr-2" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeleteDialog(dna.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {dna.persona_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Persona:</span>
                        <span className="font-medium">{dna.persona_name}</span>
                      </div>
                    )}
                    {dna.target_audience && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Público:</span>
                        <span className="font-medium">{dna.target_audience}</span>
                      </div>
                    )}
                    {dna.tone && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Tom:</span>
                        <span className="font-medium">{getToneLabel(dna.tone)}</span>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => navigate(`/dnas/${dna.id}`)}
                  >
                    <Edit2 className="h-3 w-3 mr-2" />
                    Editar DNA
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir DNA?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O DNA será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog && deleteDna(deleteDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

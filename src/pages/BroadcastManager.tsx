import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Send, Loader2, Play, Pause, Trash2, Users, Clock, Eye, MessageSquare, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SegmentedFollowup } from '@/components/broadcast';
import type { BroadcastList } from '@/types/whatsapp';

interface QueueStats {
  listId: string;
  pending: number;
  sent: number;
  failed: number;
}

export default function BroadcastManager() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lists, setLists] = useState<BroadcastList[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [newList, setNewList] = useState({
    name: '',
    description: '',
    message_template: '',
  });

  useEffect(() => {
    loadLists();
  }, []);

  const loadLists = async () => {
    try {
      const { data, error } = await supabase
        .from('broadcast_lists')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const typedData = (data || []).map(item => ({
        ...item,
        status: item.status as BroadcastList['status'],
        lead_data: (Array.isArray(item.lead_data) ? item.lead_data : []) as unknown as BroadcastList['lead_data'],
      }));
      
      setLists(typedData);
      
      // Load queue stats for each list
      const listIds = typedData.map(l => l.id);
      if (listIds.length > 0) {
        const { data: queueData } = await supabase
          .from('whatsapp_queue')
          .select('broadcast_list_id, status')
          .in('broadcast_list_id', listIds);
        
        const stats: QueueStats[] = listIds.map(id => ({
          listId: id,
          pending: queueData?.filter(q => q.broadcast_list_id === id && q.status === 'pending').length || 0,
          sent: queueData?.filter(q => q.broadcast_list_id === id && q.status === 'sent').length || 0,
          failed: queueData?.filter(q => q.broadcast_list_id === id && q.status === 'failed').length || 0,
        }));
        setQueueStats(stats);
      }
    } catch (error) {
      console.error('Error loading lists:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newList.name) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe um nome para a lista.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('broadcast_lists')
        .insert({
          name: newList.name,
          description: newList.description || null,
          message_template: newList.message_template || null,
          status: 'draft',
          phones: [],
          lead_data: [],
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Lista criada com sucesso!' });
      setNewList({ name: '', description: '', message_template: '' });
      setDialogOpen(false);
      
      // Navigate to the new list details
      if (data) {
        navigate(`/whatsapp/broadcast/${data.id}`);
      } else {
        loadLists();
      }
    } catch (error) {
      console.error('Error creating list:', error);
      toast({
        title: 'Erro ao criar lista',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const startBroadcast = async (list: BroadcastList) => {
    if (list.phones.length === 0) {
      toast({
        title: 'Lista vazia',
        description: 'Adicione contatos antes de iniciar o disparo.',
        variant: 'destructive',
      });
      return;
    }

    if (!list.message_template) {
      toast({
        title: 'Mensagem não configurada',
        description: 'Configure a mensagem modelo antes de iniciar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const queueItems = list.phones.map(phone => ({
        broadcast_list_id: list.id,
        phone,
        message: list.message_template!,
        image_url: list.image_url || null,
        status: 'pending' as const,
      }));

      const { error: queueError } = await supabase
        .from('whatsapp_queue')
        .insert(queueItems);

      if (queueError) throw queueError;

      const { error: updateError } = await supabase
        .from('broadcast_lists')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', list.id);

      if (updateError) throw updateError;

      toast({
        title: 'Disparo iniciado!',
        description: `${list.phones.length} mensagens na fila.`,
      });

      loadLists();
    } catch (error) {
      console.error('Error starting broadcast:', error);
      toast({
        title: 'Erro ao iniciar disparo',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const pauseBroadcast = async (list: BroadcastList) => {
    try {
      await supabase
        .from('broadcast_lists')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', list.id);

      toast({ title: 'Disparo pausado' });
      loadLists();
    } catch (error) {
      console.error('Error pausing broadcast:', error);
    }
  };

  const deleteList = async (e: React.MouseEvent, list: BroadcastList) => {
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir esta lista?')) return;

    try {
      await supabase
        .from('whatsapp_queue')
        .delete()
        .eq('broadcast_list_id', list.id);

      await supabase
        .from('broadcast_lists')
        .delete()
        .eq('id', list.id);

      toast({ title: 'Lista excluída' });
      loadLists();
    } catch (error) {
      console.error('Error deleting list:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      draft: { variant: 'secondary', label: 'Rascunho' },
      scheduled: { variant: 'outline', label: 'Agendado' },
      sending: { variant: 'default', label: 'Enviando' },
      completed: { variant: 'secondary', label: 'Concluído' },
      paused: { variant: 'destructive', label: 'Pausado' },
    };
    const config = variants[status] || variants.draft;
    return <Badge variant={config.variant}>{config.label}</Badge>;
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
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Disparos em Massa</h1>
            <p className="text-muted-foreground">Gerencie listas e follow-ups segmentados</p>
          </div>
        </div>

        <Tabs defaultValue="lists" className="space-y-6">
          <TabsList>
            <TabsTrigger value="lists" className="gap-2">
              <Users className="h-4 w-4" />
              Listas de Disparo
            </TabsTrigger>
            <TabsTrigger value="followup" className="gap-2">
              <Target className="h-4 w-4" />
              Follow-up Segmentado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lists" className="space-y-6">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Lista
                  </Button>
                </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Nova Lista</DialogTitle>
                <DialogDescription>
                  Crie uma lista de disparo para enviar mensagens em massa.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nome da Lista *</Label>
                  <Input
                    placeholder="Ex: Leads Janeiro 2024"
                    value={newList.name}
                    onChange={(e) => setNewList(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    placeholder="Descrição opcional"
                    value={newList.description}
                    onChange={(e) => setNewList(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem Modelo</Label>
                  <Textarea
                    placeholder="Olá! Temos uma oferta especial para você..."
                    value={newList.message_template}
                    onChange={(e) => setNewList(prev => ({ ...prev, message_template: e.target.value }))}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Lista'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {lists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma lista criada</h3>
              <p className="text-muted-foreground text-center mb-4">
                Crie uma lista de disparo para enviar mensagens em massa.
              </p>
              <Button onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeira Lista
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => {
              const total = list.phones.length;
              const stats = queueStats.find(s => s.listId === list.id);
              const sent = stats?.sent || list.sent_count;
              const failed = stats?.failed || list.failed_count;
              const pending = stats?.pending || 0;
              const progress = total > 0 ? ((sent + failed) / total) * 100 : 0;

              return (
                <Card 
                  key={list.id} 
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(`/whatsapp/broadcast/${list.id}`)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{list.name}</CardTitle>
                        <CardDescription>{list.description || 'Sem descrição'}</CardDescription>
                      </div>
                      {getStatusBadge(list.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Message Preview */}
                    {list.message_template && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                          <MessageSquare className="h-3 w-3" />
                          Mensagem:
                        </div>
                        <p className="text-sm line-clamp-2">{list.message_template}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {total} contatos
                      </div>
                      {list.scheduled_at && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {new Date(list.scheduled_at).toLocaleDateString('pt-BR')}
                        </div>
                      )}
                    </div>

                    {(list.status === 'sending' || list.status === 'paused') && (
                      <div className="space-y-2">
                        <Progress value={progress} />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="text-green-600">{sent} enviadas</span>
                          <span>{pending} pendentes</span>
                          <span className="text-destructive">{failed} falhas</span>
                        </div>
                      </div>
                    )}

                    {list.status === 'completed' && (
                      <div className="text-sm flex gap-3">
                        <span className="text-green-600">{sent} enviadas</span>
                        {failed > 0 && (
                          <span className="text-destructive">{failed} falhas</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/whatsapp/broadcast/${list.id}`);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                        Detalhes
                      </Button>
                      {list.status === 'draft' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            startBroadcast(list);
                          }}
                          className="gap-1"
                        >
                          <Send className="h-3 w-3" />
                        </Button>
                      )}
                      {list.status === 'sending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            pauseBroadcast(list);
                          }}
                          className="gap-1"
                        >
                          <Pause className="h-3 w-3" />
                        </Button>
                      )}
                      {list.status === 'paused' && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            startBroadcast(list);
                          }}
                          className="gap-1"
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => deleteList(e, list)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            </div>
          )}
          </TabsContent>

          <TabsContent value="followup">
            <SegmentedFollowup />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

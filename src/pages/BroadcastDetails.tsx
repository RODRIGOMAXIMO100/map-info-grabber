import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, Send, Pause, Play, Trash2, Users, Clock, 
  RefreshCw, CheckCircle2, XCircle, Loader2, AlertCircle, MessageSquare,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { BroadcastList } from '@/types/whatsapp';

interface QueueItem {
  id: string;
  phone: string;
  message: string;
  status: string;
  attempts: number;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  image_url: string | null;
}

const DEFAULT_MESSAGE = `Olá, meu nome é Rodrigo, encontrei você [nome da empresa] pelo google e gostaria de apresentar uma solução que pode ajudar seu negócio.

Podemos conversar?`;

export default function BroadcastDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  
  const [list, setList] = useState<BroadcastList | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedImageUrl, setEditedImageUrl] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
      // Set up realtime subscription for queue updates
      const channel = supabase
        .channel('queue-updates')
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'whatsapp_queue', filter: `broadcast_list_id=eq.${id}` },
          () => loadQueue()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadList(), loadQueue()]);
    setLoading(false);
  };

  const loadList = async () => {
    if (!id) return;
    
    const { data, error } = await supabase
      .from('broadcast_lists')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error loading list:', error);
      toast({ title: 'Erro ao carregar lista', variant: 'destructive' });
      navigate('/whatsapp/broadcast');
      return;
    }

    const typedData: BroadcastList = {
      ...data,
      status: data.status as BroadcastList['status'],
      lead_data: (Array.isArray(data.lead_data) ? data.lead_data : []) as unknown as BroadcastList['lead_data'],
    };
    
    setList(typedData);
    setEditedMessage(data.message_template || DEFAULT_MESSAGE);
    setEditedImageUrl(data.image_url || '');
  };

  const loadQueue = async () => {
    if (!id) return;
    
    const { data, error } = await supabase
      .from('whatsapp_queue')
      .select('*')
      .eq('broadcast_list_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error loading queue:', error);
      return;
    }

    setQueue(data || []);
  };

  const saveMessage = async () => {
    if (!list) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('broadcast_lists')
        .update({ 
          message_template: editedMessage,
          image_url: editedImageUrl || null,
          updated_at: new Date().toISOString() 
        })
        .eq('id', list.id);

      if (error) throw error;

      toast({ title: 'Mensagem salva!' });
      loadList();
    } catch (error) {
      console.error('Error saving message:', error);
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !list) return;

    // Validate file type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    if (!isImage && !isVideo) {
      toast({ title: 'Tipo de arquivo não suportado. Use imagem ou vídeo.', variant: 'destructive' });
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: 'Arquivo muito grande. Máximo 50MB.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${list.id}/${Date.now()}.${fileExt}`;
      
      const { error } = await supabase.storage
        .from('broadcast-media')
        .upload(fileName, file, { upsert: true });
      
      if (error) throw error;
      
      const { data: urlData } = supabase.storage
        .from('broadcast-media')
        .getPublicUrl(fileName);
      
      setEditedImageUrl(urlData.publicUrl);
      toast({ title: 'Mídia enviada com sucesso!' });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ title: 'Erro ao enviar mídia', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const isVideoUrl = (url: string) => {
    return /\.(mp4|mov|webm|avi|mkv)$/i.test(url);
  };

  const removeMedia = () => {
    setEditedImageUrl('');
  };

  const startBroadcast = async () => {
    if (!list) return;

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
      // Check if there are already pending items in queue
      const existingPending = queue.filter(q => q.status === 'pending').length;
      
      if (existingPending === 0) {
        // Add all phones to queue
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
      }

      // Update list status
      const { error: updateError } = await supabase
        .from('broadcast_lists')
        .update({ status: 'sending', updated_at: new Date().toISOString() })
        .eq('id', list.id);

      if (updateError) throw updateError;

      toast({
        title: 'Disparo iniciado!',
        description: `${list.phones.length} mensagens na fila.`,
      });

      loadData();
    } catch (error) {
      console.error('Error starting broadcast:', error);
      toast({
        title: 'Erro ao iniciar disparo',
        variant: 'destructive',
      });
    }
  };

  const pauseBroadcast = async () => {
    if (!list) return;
    
    try {
      await supabase
        .from('broadcast_lists')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', list.id);

      toast({ title: 'Disparo pausado' });
      loadList();
    } catch (error) {
      console.error('Error pausing broadcast:', error);
    }
  };

  const retryFailed = async () => {
    if (!list) return;
    
    try {
      const { error } = await supabase
        .from('whatsapp_queue')
        .update({ status: 'pending', attempts: 0, error_message: null })
        .eq('broadcast_list_id', list.id)
        .eq('status', 'failed');

      if (error) throw error;

      toast({ title: 'Falhas reenviadas para a fila!' });
      loadQueue();
    } catch (error) {
      console.error('Error retrying failed:', error);
    }
  };

  const retrySingle = async (queueId: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_queue')
        .update({ status: 'pending', attempts: 0, error_message: null })
        .eq('id', queueId);

      if (error) throw error;

      toast({ title: 'Reenvio agendado!' });
      loadQueue();
    } catch (error) {
      console.error('Error retrying single:', error);
    }
  };

  const deleteList = async () => {
    if (!list) return;
    if (!confirm('Tem certeza que deseja excluir esta lista?')) return;

    try {
      await supabase.from('whatsapp_queue').delete().eq('broadcast_list_id', list.id);
      await supabase.from('broadcast_lists').delete().eq('id', list.id);
      
      toast({ title: 'Lista excluída' });
      navigate('/whatsapp/broadcast');
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

  const getQueueStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'sent': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Lista não encontrada</p>
      </div>
    );
  }

  const total = list.phones.length;
  const sent = queue.filter(q => q.status === 'sent').length;
  const failed = queue.filter(q => q.status === 'failed').length;
  const pending = queue.filter(q => q.status === 'pending').length;
  const processing = queue.filter(q => q.status === 'processing').length;
  const progress = total > 0 ? ((sent + failed) / total) * 100 : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/whatsapp/broadcast')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{list.name}</h1>
                {getStatusBadge(list.status)}
              </div>
              <p className="text-muted-foreground">{list.description || 'Sem descrição'}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {list.status === 'draft' && (
              <Button onClick={startBroadcast} className="gap-2">
                <Send className="h-4 w-4" />
                Iniciar Disparo
              </Button>
            )}
            {list.status === 'sending' && (
              <Button variant="outline" onClick={pauseBroadcast} className="gap-2">
                <Pause className="h-4 w-4" />
                Pausar
              </Button>
            )}
            {list.status === 'paused' && (
              <Button onClick={startBroadcast} className="gap-2">
                <Play className="h-4 w-4" />
                Continuar
              </Button>
            )}
            <Button variant="ghost" onClick={deleteList} className="text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{total}</p>
                  <p className="text-sm text-muted-foreground">Contatos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">{sent}</p>
                  <p className="text-sm text-muted-foreground">Enviados</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{pending + processing}</p>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{failed}</p>
                  <p className="text-sm text-muted-foreground">Falhas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Progress Bar */}
        {(list.status === 'sending' || list.status === 'completed' || list.status === 'paused') && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso do Disparo</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Mensagem</TabsTrigger>
            <TabsTrigger value="queue">
              Fila de Disparo
              {pending > 0 && (
                <Badge variant="secondary" className="ml-2">{pending}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="contacts">Contatos ({total})</TabsTrigger>
          </TabsList>

          {/* Message Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mensagem do Disparo
                </CardTitle>
                <CardDescription>
                  Esta é a mensagem que será enviada para todos os contatos da lista.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Mensagem *</Label>
                  <Textarea
                    value={editedMessage}
                    onChange={(e) => setEditedMessage(e.target.value)}
                    rows={6}
                    placeholder="Digite a mensagem que será enviada..."
                    disabled={list.status === 'sending'}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Mídia (opcional) - Imagem ou Vídeo
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*,video/*"
                      onChange={handleFileUpload}
                      disabled={list.status === 'sending' || uploading}
                      className="flex-1"
                    />
                    {uploading && <Loader2 className="h-5 w-5 animate-spin" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, GIF, MP4, MOV, WEBM (máx. 50MB)
                  </p>
                </div>

                {editedImageUrl && (
                  <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm text-muted-foreground">Preview da mídia:</p>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={removeMedia}
                        className="text-destructive hover:text-destructive"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Remover
                      </Button>
                    </div>
                    {isVideoUrl(editedImageUrl) ? (
                      <video 
                        src={editedImageUrl} 
                        controls 
                        className="max-w-xs max-h-48 rounded"
                      />
                    ) : (
                      <img 
                        src={editedImageUrl} 
                        alt="Preview" 
                        className="max-w-xs max-h-48 object-contain rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                )}

                {list.status !== 'sending' && (
                  <Button onClick={saveMessage} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Mensagem
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Queue Tab */}
          <TabsContent value="queue" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Fila de Disparo</CardTitle>
                    <CardDescription>
                      Acompanhe o status de cada mensagem em tempo real.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={loadQueue} className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      Atualizar
                    </Button>
                    {failed > 0 && (
                      <Button size="sm" onClick={retryFailed} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Retentar Falhas ({failed})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {queue.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhuma mensagem na fila ainda.</p>
                    <p className="text-sm">Inicie o disparo para adicionar mensagens à fila.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Status</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Horário</TableHead>
                          <TableHead>Tentativas</TableHead>
                          <TableHead>Erro</TableHead>
                          <TableHead className="w-20">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queue.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{getQueueStatusIcon(item.status)}</TableCell>
                            <TableCell className="font-mono">{item.phone}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(item.processed_at || item.created_at)}
                            </TableCell>
                            <TableCell>{item.attempts}</TableCell>
                            <TableCell className="text-sm text-destructive max-w-[200px] truncate">
                              {item.error_message || '-'}
                            </TableCell>
                            <TableCell>
                              {item.status === 'failed' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => retrySingle(item.id)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Contatos da Lista</CardTitle>
                <CardDescription>
                  {total} contatos serão incluídos no disparo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {total === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nenhum contato adicionado ainda.</p>
                    <p className="text-sm">Adicione contatos através da busca de estabelecimentos.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Status do Envio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.phones.map((phone, idx) => {
                          const leadInfo = list.lead_data.find(l => l.phone === phone);
                          const queueItem = queue.find(q => q.phone === phone);
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-mono">{phone}</TableCell>
                              <TableCell>{leadInfo?.name || '-'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {queueItem ? (
                                    <>
                                      {getQueueStatusIcon(queueItem.status)}
                                      <span className="text-sm capitalize">{queueItem.status}</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">Aguardando</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

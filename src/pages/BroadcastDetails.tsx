import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, Save, Send, Pause, Play, Trash2, Users, Clock, 
  RefreshCw, CheckCircle2, XCircle, Loader2, AlertCircle, MessageSquare,
  Image as ImageIcon, ShieldCheck, Phone, PhoneOff, UserCheck
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
import { useRealtimeRefresh } from '@/hooks/useRealtimeSubscription';
import { supabase } from '@/integrations/supabase/client';
import type { BroadcastList, LeadData } from '@/types/whatsapp';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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


interface ValidationResult {
  phone: string;
  exists: boolean;
  formattedNumber: string | null;
  isLandline: boolean;
  error?: string;
}

interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  landlines: number;
  successRate: number;
}

const DEFAULT_MESSAGE = `Oi! Vi a {nome_empresa} aqui em {cidade} e achei interessante.

Posso te fazer uma pergunta rápida?`;

const AVAILABLE_VARIABLES = [
  { key: '{nome_empresa}', label: 'Nome da Empresa', field: 'name' },
  { key: '{cidade}', label: 'Cidade', field: 'city' },
  { key: '{estado}', label: 'Estado', field: 'state' },
  { key: '{rating}', label: 'Avaliação', field: 'rating' },
  { key: '{website}', label: 'Website', field: 'website' },
];

// Extrai o nome real do estabelecimento (parte depois do " - ")
const extractRealName = (title: string): string => {
  if (!title) return '';
  
  // Se tiver " - ", pega a parte DEPOIS (nome real do profissional/estabelecimento)
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts[1] && parts[1].trim().length > 3) {
      return parts[1].trim();
    }
  }
  
  // Se tiver " | ", pega a parte DEPOIS
  if (title.includes(' | ')) {
    const parts = title.split(' | ');
    if (parts[1] && parts[1].trim().length > 3) {
      return parts[1].trim();
    }
  }
  
  // Fallback: retorna o título original
  return title;
};

const replaceVariables = (message: string, lead: LeadData | null): string => {
  if (!lead) return message;
  let result = message;
  const cleanName = extractRealName(String(lead.name || 'sua empresa'));
  result = result.replace(/{nome_empresa}/g, cleanName);
  result = result.replace(/{cidade}/g, String(lead.city || ''));
  result = result.replace(/{estado}/g, String(lead.state || ''));
  result = result.replace(/{rating}/g, String(lead.rating || ''));
  result = result.replace(/{website}/g, String(lead.website || ''));
  return result;
};

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
  
  // Validation state
  const [validating, setValidating] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validatedPhones, setValidatedPhones] = useState<Set<string>>(new Set());
  const [invalidPhones, setInvalidPhones] = useState<Set<string>>(new Set());
  
  // User assignment state
  const [users, setUsers] = useState<Array<{ user_id: string; name: string; role: string }>>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (id) {
      loadData();
      loadUsers();
    }
  }, [id]);

  // Centralized realtime subscription for queue updates
  useRealtimeRefresh('whatsapp_queue', useCallback(() => {
    if (id) loadQueue();
  }, [id]), { enabled: !!id });

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      // Load users with their roles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('user_id, full_name');
      
      if (error) throw error;
      
      // Get roles for each user
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .maybeSingle();
          
          return {
            user_id: profile.user_id,
            name: profile.full_name || 'Sem nome',
            role: roleData?.role || 'user'
          };
        })
      );
      
      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

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
    setSelectedAssignee((data as any).assigned_to || null);
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
          assigned_to: selectedAssignee || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', list.id);

      if (error) throw error;

      toast({ title: 'Configurações salvas!' });
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
        // Add all phones to queue with lead_data for personalization
        const queueItems = list.phones.map(phone => {
          const leadInfo = list.lead_data.find(l => l.phone === phone);
          return {
            broadcast_list_id: list.id,
            phone,
            message: list.message_template!,
            image_url: list.image_url || null,
            status: 'pending' as const,
            lead_data: leadInfo || null,
          };
        });

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
      // Update broadcast list status to paused
      await supabase
        .from('broadcast_lists')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', list.id);

      // Also revert any 'processing' messages back to 'pending' so they don't continue sending
      const { data: revertedMessages } = await supabase
        .from('whatsapp_queue')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('broadcast_list_id', list.id)
        .eq('status', 'processing')
        .select('id');

      const revertedCount = revertedMessages?.length || 0;
      
      toast({ 
        title: 'Disparo pausado', 
        description: revertedCount > 0 ? `${revertedCount} mensagens em processamento foram revertidas.` : undefined
      });
      loadList();
      loadQueue();
    } catch (error) {
      console.error('Error pausing broadcast:', error);
      toast({ title: 'Erro ao pausar', variant: 'destructive' });
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

  // Validate phone numbers before broadcast
  const validatePhones = async () => {
    if (!list || list.phones.length === 0) {
      toast({
        title: 'Lista vazia',
        description: 'Adicione contatos antes de validar.',
        variant: 'destructive',
      });
      return;
    }

    setValidating(true);
    setValidationResults([]);
    setValidationSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke('validate-phone-numbers', {
        body: {
          phones: list.phones,
          broadcastListId: list.id,
        },
      });

      if (error) throw error;

      if (data.success) {
        setValidationResults(data.results);
        setValidationSummary(data.summary);
        setValidatedPhones(new Set(data.validPhones));
        setInvalidPhones(new Set(data.invalidPhones));
        setShowValidationDialog(true);
        
        // Reload list to get updated validation columns
        loadList();

        toast({
          title: 'Validação concluída!',
          description: `${data.summary.valid} válidos, ${data.summary.invalid} inválidos`,
        });
      } else {
        throw new Error(data.error || 'Erro na validação');
      }
    } catch (error) {
      console.error('Error validating phones:', error);
      toast({
        title: 'Erro ao validar números',
        description: String(error),
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
    }
  };

  // Remove invalid phones from the list
  const removeInvalidPhones = async () => {
    if (!list || invalidPhones.size === 0) return;

    try {
      const validPhonesArray = list.phones.filter(p => !invalidPhones.has(p));
      const validLeadData = list.lead_data.filter(l => !invalidPhones.has(l.phone));

      const { error } = await supabase
        .from('broadcast_lists')
        .update({
          phones: validPhonesArray,
          lead_data: validLeadData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', list.id);

      if (error) throw error;

      toast({
        title: 'Números inválidos removidos!',
        description: `${invalidPhones.size} números removidos da lista.`,
      });

      setShowValidationDialog(false);
      setInvalidPhones(new Set());
      loadList();
    } catch (error) {
      console.error('Error removing invalid phones:', error);
      toast({
        title: 'Erro ao remover números',
        variant: 'destructive',
      });
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
            {/* Validate Button - always show for draft/paused */}
            {(list.status === 'draft' || list.status === 'paused') && (
              <Button 
                variant="outline" 
                onClick={validatePhones} 
                disabled={validating || list.phones.length === 0}
                className="gap-2"
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {validating ? 'Validando...' : 'Validar Números'}
              </Button>
            )}
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
        <div className="grid gap-4 md:grid-cols-5">
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
          
          {/* Validation Status Card */}
          <Card className={(list as any).validated_at ? 'border-green-500/30' : 'border-amber-500/30'}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className={`h-8 w-8 ${(list as any).validated_at ? 'text-green-600' : 'text-amber-500'}`} />
                <div>
                  {(list as any).validated_at ? (
                    <>
                      <p className="text-2xl font-bold text-green-600">{(list as any).valid_count || 0}</p>
                      <p className="text-sm text-muted-foreground">
                        Validados
                        {(list as any).invalid_count > 0 && (
                          <span className="text-destructive ml-1">({(list as any).invalid_count} inválidos)</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-medium text-amber-500">Não validado</p>
                      <p className="text-xs text-muted-foreground">Clique em "Validar"</p>
                    </>
                  )}
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
                  Use variáveis dinâmicas para personalizar cada mensagem automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Available Variables */}
                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                  <Label className="text-sm font-medium">Variáveis Disponíveis</Label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_VARIABLES.map((v) => (
                      <Badge 
                        key={v.key} 
                        variant="secondary" 
                        className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={() => {
                          if (list.status !== 'sending') {
                            setEditedMessage(prev => prev + ' ' + v.key);
                          }
                        }}
                      >
                        {v.key} <span className="ml-1 text-xs opacity-70">({v.label})</span>
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clique para adicionar à mensagem. Cada variável será substituída pelos dados reais do lead.
                  </p>
                </div>

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

                {/* Live Preview */}
                {list.lead_data.length > 0 && (
                  <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Preview da Mensagem (usando primeiro lead)
                    </Label>
                    <div className="bg-background rounded-lg p-3 text-sm whitespace-pre-wrap border">
                      {replaceVariables(editedMessage, list.lead_data[0])}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Lead: {list.lead_data[0]?.name || 'Sem nome'} - {list.lead_data[0]?.city || 'Sem cidade'}
                    </p>
                  </div>
                )}
                
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

                {/* User Assignment Selector */}
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <UserCheck className="h-4 w-4 text-primary" />
                    Atribuir leads para
                  </Label>
                  <Select
                    value={selectedAssignee || "none"}
                    onValueChange={(value) => setSelectedAssignee(value === "none" ? null : value)}
                    disabled={list.status === 'sending' || loadingUsers}
                  >
                    <SelectTrigger className="w-full md:w-72">
                      <SelectValue placeholder="Selecione um usuário..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground">Não atribuir (aparece para todos)</span>
                      </SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          <div className="flex items-center gap-2">
                            <span>{user.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {user.role === 'admin' ? 'Admin' : user.role === 'sdr' ? 'SDR' : 'Closer'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Os leads gerados por este disparo serão atribuídos automaticamente ao usuário selecionado.
                    Se não atribuir, os chats aparecerão para todos os usuários.
                  </p>
                </div>

                {list.status !== 'sending' && (
                  <Button onClick={saveMessage} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Configurações
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
                          <TableHead className="w-12">WhatsApp</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Status do Envio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.phones.map((phone, idx) => {
                          const leadInfo = list.lead_data.find(l => l.phone === phone);
                          const queueItem = queue.find(q => q.phone === phone);
                          const isValid = validatedPhones.has(phone);
                          const isInvalid = invalidPhones.has(phone);
                          const hasValidation = validatedPhones.size > 0 || invalidPhones.size > 0;
                          
                          return (
                            <TableRow key={idx} className={isInvalid ? 'bg-destructive/5' : ''}>
                              <TableCell>
                                {hasValidation ? (
                                  isValid ? (
                                    <Phone className="h-4 w-4 text-green-600" />
                                  ) : isInvalid ? (
                                    <PhoneOff className="h-4 w-4 text-destructive" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                  )
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono">{phone}</TableCell>
                              <TableCell>{leadInfo?.name || '-'}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {queueItem ? (
                                    <>
                                      {getQueueStatusIcon(queueItem.status)}
                                      <span className="text-sm capitalize">{queueItem.status}</span>
                                    </>
                                  ) : isInvalid ? (
                                    <span className="text-destructive text-sm">Sem WhatsApp</span>
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

      {/* Validation Results Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Resultado da Validação
            </DialogTitle>
            <DialogDescription>
              Verificamos quais números estão ativos no WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          {validationSummary && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{validationSummary.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{validationSummary.valid}</p>
                  <p className="text-xs text-green-600">Válidos</p>
                </div>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-destructive">{validationSummary.invalid}</p>
                  <p className="text-xs text-destructive">Inválidos</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{validationSummary.landlines}</p>
                  <p className="text-xs text-amber-600">Fixos</p>
                </div>
              </div>

              {/* Success Rate */}
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Taxa de Sucesso Esperada</span>
                  <span className="text-lg font-bold text-green-600">{validationSummary.successRate}%</span>
                </div>
                <Progress value={validationSummary.successRate} className="h-2" />
              </div>

              {/* Invalid Numbers List */}
              {validationResults.filter(r => !r.exists).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <PhoneOff className="h-4 w-4 text-destructive" />
                    Números Inválidos ({validationResults.filter(r => !r.exists).length})
                  </Label>
                  <ScrollArea className="h-[200px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Motivo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationResults.filter(r => !r.exists).map((result, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{result.phone}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {result.isLandline ? 'Telefone fixo' : result.error || 'Não encontrado no WhatsApp'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                {invalidPhones.size > 0 && (
                  <Button 
                    variant="destructive" 
                    onClick={removeInvalidPhones}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover {invalidPhones.size} Inválidos
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  onClick={() => setShowValidationDialog(false)}
                  className="ml-auto"
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

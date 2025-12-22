import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, TestTube, Loader2, CheckCircle, XCircle, Copy, Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface WhatsAppInstance {
  id: string;
  name: string;
  color: string;
  server_url: string;
  instance_token: string;
  admin_token: string;
  instance_phone: string;
  is_active: boolean;
  testResult?: 'success' | 'error' | null;
  testing?: boolean;
}

const PRESET_COLORS = [
  '#10B981', // green
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
];

export default function WhatsAppConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [instanceToDelete, setInstanceToDelete] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setInstances((data || []).map(d => ({
        id: d.id,
        name: d.name || 'Principal',
        color: d.color || '#10B981',
        server_url: d.server_url || '',
        instance_token: d.instance_token || '',
        admin_token: d.admin_token || '',
        instance_phone: d.instance_phone || '',
        is_active: d.is_active ?? true,
      })));
    } catch (error) {
      console.error('Error loading instances:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    const newInstance: WhatsAppInstance = {
      id: '',
      name: `Instância ${instances.length + 1}`,
      color: PRESET_COLORS[instances.length % PRESET_COLORS.length],
      server_url: '',
      instance_token: '',
      admin_token: '',
      instance_phone: '',
      is_active: true,
    };
    setSelectedInstance(newInstance);
    setIsEditing(true);
  };

  const handleEdit = (instance: WhatsAppInstance) => {
    setSelectedInstance({ ...instance });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedInstance) return;
    
    if (!selectedInstance.server_url || !selectedInstance.instance_token) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha a URL do servidor e o token da instância.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      if (selectedInstance.id) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update({
            name: selectedInstance.name,
            color: selectedInstance.color,
            server_url: selectedInstance.server_url,
            instance_token: selectedInstance.instance_token,
            admin_token: selectedInstance.admin_token || null,
            instance_phone: selectedInstance.instance_phone || null,
            is_active: selectedInstance.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedInstance.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('whatsapp_config')
          .insert({
            name: selectedInstance.name,
            color: selectedInstance.color,
            server_url: selectedInstance.server_url,
            instance_token: selectedInstance.instance_token,
            admin_token: selectedInstance.admin_token || null,
            instance_phone: selectedInstance.instance_phone || null,
            is_active: selectedInstance.is_active,
          });

        if (error) throw error;
      }

      toast({
        title: 'Configuração salva!',
        description: `A instância "${selectedInstance.name}" foi ${selectedInstance.id ? 'atualizada' : 'criada'}.`,
      });
      
      setIsEditing(false);
      setSelectedInstance(null);
      loadInstances();
    } catch (error) {
      console.error('Error saving instance:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar a configuração.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!instanceToDelete) return;
    
    try {
      const { error } = await supabase
        .from('whatsapp_config')
        .delete()
        .eq('id', instanceToDelete);

      if (error) throw error;

      toast({
        title: 'Instância removida',
        description: 'A instância foi removida com sucesso.',
      });
      
      setDeleteDialogOpen(false);
      setInstanceToDelete(null);
      loadInstances();
    } catch (error) {
      console.error('Error deleting instance:', error);
      toast({
        title: 'Erro ao remover',
        description: 'Não foi possível remover a instância.',
        variant: 'destructive',
      });
    }
  };

  const handleTest = async (instance: WhatsAppInstance) => {
    if (!instance.server_url || !instance.instance_token) {
      toast({
        title: 'Configure primeiro',
        description: 'Preencha a URL do servidor e o token antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    setInstances(prev => prev.map(i => 
      i.id === instance.id ? { ...i, testing: true, testResult: null } : i
    ));

    try {
      const serverUrl = instance.server_url.replace(/\/$/, '');
      const endpoints = ['/status', '/session/status', '/instance/status'];
      let success = false;
      
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${serverUrl}${endpoint}`, {
            method: 'GET',
            headers: {
              'token': instance.instance_token,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            success = true;
            break;
          }
        } catch {
          continue;
        }
      }

      setInstances(prev => prev.map(i => 
        i.id === instance.id ? { ...i, testing: false, testResult: success ? 'success' : 'error' } : i
      ));

      toast({
        title: success ? 'Conexão bem-sucedida!' : 'Falha na conexão',
        description: success ? `"${instance.name}" está conectado.` : 'Verifique as credenciais.',
        variant: success ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Test connection error:', error);
      setInstances(prev => prev.map(i => 
        i.id === instance.id ? { ...i, testing: false, testResult: 'error' } : i
      ));
    }
  };

  const getWebhookUrl = (instanceId: string) => {
    return `https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/whatsapp-receive-webhook?instance=${instanceId}`;
  };

  const copyWebhookUrl = async (instanceId: string) => {
    await navigator.clipboard.writeText(getWebhookUrl(instanceId));
    setCopied(instanceId);
    toast({
      title: 'URL copiada!',
      description: 'Cole esta URL no painel da UAZAPI.',
    });
    setTimeout(() => setCopied(null), 2000);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Instâncias WhatsApp</h1>
              <p className="text-muted-foreground">Gerencie múltiplas conexões com UAZAPI</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Instância
          </Button>
        </div>

        {instances.length === 0 && !isEditing ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">Nenhuma instância configurada</p>
              <Button onClick={handleAddNew} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Primeira Instância
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {instances.map((instance) => (
              <Card 
                key={instance.id} 
                className={cn(
                  "transition-all hover:shadow-md cursor-pointer",
                  !instance.is_active && "opacity-60"
                )}
                onClick={() => handleEdit(instance)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: instance.color }}
                      />
                      <CardTitle className="text-lg">{instance.name}</CardTitle>
                      {!instance.is_active && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">Inativa</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(instance)}
                        disabled={instance.testing}
                        className="gap-1"
                      >
                        {instance.testing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : instance.testResult === 'success' ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : instance.testResult === 'error' ? (
                          <XCircle className="h-3 w-3 text-red-500" />
                        ) : (
                          <TestTube className="h-3 w-3" />
                        )}
                        Testar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setInstanceToDelete(instance.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Servidor:</span>
                      <p className="font-mono truncate">{instance.server_url || '-'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Telefone:</span>
                      <p>{instance.instance_phone || '-'}</p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Webhook:</span>
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                        {getWebhookUrl(instance.id)}
                      </code>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyWebhookUrl(instance.id);
                        }}
                      >
                        {copied === instance.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit/Create Dialog */}
        <Dialog open={isEditing} onOpenChange={(open) => !open && setIsEditing(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selectedInstance?.id ? 'Editar Instância' : 'Nova Instância'}
              </DialogTitle>
              <DialogDescription>
                Configure as credenciais da instância UAZAPI.
              </DialogDescription>
            </DialogHeader>

            {selectedInstance && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome da Instância *</Label>
                    <Input
                      placeholder="Ex: Vendas, Suporte"
                      value={selectedInstance.name}
                      onChange={(e) => setSelectedInstance(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cor de Identificação</Label>
                    <div className="flex gap-2 flex-wrap">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-transform",
                            selectedInstance.color === color ? "border-foreground scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color }}
                          onClick={() => setSelectedInstance(prev => prev ? { ...prev, color } : null)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>URL do Servidor *</Label>
                  <Input
                    placeholder="https://seuservidor.uazapi.com"
                    value={selectedInstance.server_url}
                    onChange={(e) => setSelectedInstance(prev => prev ? { ...prev, server_url: e.target.value } : null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Token da Instância *</Label>
                  <Input
                    type="password"
                    placeholder="Seu token de autenticação"
                    value={selectedInstance.instance_token}
                    onChange={(e) => setSelectedInstance(prev => prev ? { ...prev, instance_token: e.target.value } : null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Token Admin (opcional)</Label>
                  <Input
                    type="password"
                    placeholder="Token de administração"
                    value={selectedInstance.admin_token}
                    onChange={(e) => setSelectedInstance(prev => prev ? { ...prev, admin_token: e.target.value } : null)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Telefone da Instância</Label>
                  <Input
                    placeholder="5511999999999"
                    value={selectedInstance.instance_phone}
                    onChange={(e) => setSelectedInstance(prev => prev ? { ...prev, instance_phone: e.target.value } : null)}
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="space-y-0.5">
                    <Label>Instância Ativa</Label>
                    <p className="text-sm text-muted-foreground">
                      Habilita/desabilita o envio de mensagens
                    </p>
                  </div>
                  <Switch
                    checked={selectedInstance.is_active}
                    onCheckedChange={(checked) => setSelectedInstance(prev => prev ? { ...prev, is_active: checked } : null)}
                  />
                </div>

                {selectedInstance.id && (
                  <div className="pt-4 border-t">
                    <Label className="text-sm">Webhook URL</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        readOnly
                        value={getWebhookUrl(selectedInstance.id)}
                        className="font-mono text-xs bg-muted"
                      />
                      <Button 
                        variant="outline" 
                        size="icon" 
                        onClick={() => copyWebhookUrl(selectedInstance.id)}
                      >
                        {copied === selectedInstance.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure esta URL no painel UAZAPI para receber mensagens desta instância.
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remover Instância</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover esta instância? As conversas vinculadas não serão excluídas.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Remover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

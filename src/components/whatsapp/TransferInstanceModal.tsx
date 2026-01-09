import { useState, useEffect } from 'react';
import { ArrowRightLeft, AlertCircle, Check, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface WhatsAppInstance {
  id: string;
  name: string;
  color: string;
  instance_phone: string;
  is_active: boolean;
}

interface TransferInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentConfigId: string | null;
  contactName: string;
  contactPhone: string;
  onTransferComplete: () => void;
}

export function TransferInstanceModal({
  open,
  onOpenChange,
  conversationId,
  currentConfigId,
  contactName,
  contactPhone,
  onTransferComplete,
}: TransferInstanceModalProps) {
  const { toast } = useToast();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('');
  const [sendNotification, setSendNotification] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState(
    'Olá! Estamos continuando nossa conversa por este número. 📱'
  );
  const [transferring, setTransferring] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentInstance = instances.find(i => i.id === currentConfigId);
  const selectedInstance = instances.find(i => i.id === selectedInstanceId);
  const availableInstances = instances.filter(i => i.id !== currentConfigId && i.is_active);

  useEffect(() => {
    if (open) {
      loadInstances();
    }
  }, [open]);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_config')
        .select('id, name, color, instance_phone, is_active')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setInstances((data || []).map(d => ({
        id: d.id,
        name: d.name || 'Principal',
        color: d.color || '#10B981',
        instance_phone: d.instance_phone || '',
        is_active: d.is_active ?? true,
      })));
    } catch (error) {
      console.error('Error loading instances:', error);
      toast({
        title: 'Erro ao carregar instâncias',
        description: 'Não foi possível carregar as instâncias disponíveis.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 13 && digits.startsWith('55')) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    return phone;
  };

  const handleTransfer = async () => {
    if (!selectedInstanceId) {
      toast({
        title: 'Selecione uma instância',
        description: 'Escolha a instância para onde deseja transferir a conversa.',
        variant: 'destructive',
      });
      return;
    }

    setTransferring(true);
    try {
      // Update the conversation's config_id
      const { error: updateError } = await supabase
        .from('whatsapp_conversations')
        .update({ config_id: selectedInstanceId })
        .eq('id', conversationId);

      if (updateError) throw updateError;

      // Optionally send notification message
      if (sendNotification && selectedInstance) {
        try {
          await supabase.functions.invoke('whatsapp-send-message', {
            body: {
              conversation_id: conversationId,
              message: notificationMessage,
              config_id: selectedInstanceId,
            },
          });
        } catch (msgError) {
          console.error('Error sending notification message:', msgError);
          // Don't fail the transfer if message fails
        }
      }

      toast({
        title: 'Conversa transferida!',
        description: `A conversa foi transferida para ${selectedInstance?.name || 'a nova instância'}.`,
      });

      onTransferComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error transferring conversation:', error);
      toast({
        title: 'Erro ao transferir',
        description: 'Não foi possível transferir a conversa. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir Conversa
          </DialogTitle>
          <DialogDescription>
            Transfira esta conversa para outra instância do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current instance info */}
          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Conversa atual</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{contactName || contactPhone}</p>
                <p className="text-xs text-muted-foreground">{formatPhone(contactPhone)}</p>
              </div>
              {currentInstance ? (
                <Badge 
                  variant="outline" 
                  className="flex items-center gap-1.5"
                  style={{ borderColor: currentInstance.color, color: currentInstance.color }}
                >
                  {currentInstance.is_active ? (
                    <Wifi className="h-3 w-3" />
                  ) : (
                    <WifiOff className="h-3 w-3" />
                  )}
                  {currentInstance.name}
                </Badge>
              ) : (
                <Badge variant="secondary">Sem instância</Badge>
              )}
            </div>
            {currentInstance && (
              <p className="text-xs text-muted-foreground mt-1">
                via {formatPhone(currentInstance.instance_phone)}
              </p>
            )}
            {currentInstance && !currentInstance.is_active && (
              <div className="flex items-center gap-1.5 mt-2 text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                <span className="text-xs">Instância desconectada ou bloqueada</span>
              </div>
            )}
          </div>

          {/* Available instances */}
          <div>
            <p className="text-sm font-medium mb-2">Transferir para:</p>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableInstances.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma outra instância ativa disponível.</p>
                <p className="text-xs mt-1">Configure mais instâncias em Configurações.</p>
              </div>
            ) : (
              <RadioGroup value={selectedInstanceId} onValueChange={setSelectedInstanceId}>
                <div className="space-y-2">
                  {availableInstances.map((instance) => (
                    <div
                      key={instance.id}
                      className={`flex items-center space-x-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        selectedInstanceId === instance.id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedInstanceId(instance.id)}
                    >
                      <RadioGroupItem value={instance.id} id={instance.id} />
                      <div className="flex-1">
                        <Label 
                          htmlFor={instance.id} 
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: instance.color }}
                          />
                          <span className="font-medium">{instance.name}</span>
                          <Wifi className="h-3 w-3 text-green-500" />
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatPhone(instance.instance_phone)}
                        </p>
                      </div>
                      {selectedInstanceId === instance.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}
          </div>

          {/* Send notification option */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="send-notification" 
                checked={sendNotification}
                onCheckedChange={(checked) => setSendNotification(checked === true)}
              />
              <Label htmlFor="send-notification" className="text-sm cursor-pointer">
                Enviar mensagem avisando sobre o novo número
              </Label>
            </div>
            
            {sendNotification && (
              <div className="space-y-2 pl-6">
                <Textarea
                  value={notificationMessage}
                  onChange={(e) => setNotificationMessage(e.target.value)}
                  placeholder="Digite a mensagem de notificação..."
                  className="min-h-[80px] resize-none text-sm"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {notificationMessage.length}/500 caracteres
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={transferring}>
            Cancelar
          </Button>
          <Button 
            onClick={handleTransfer} 
            disabled={!selectedInstanceId || transferring || availableInstances.length === 0}
          >
            {transferring ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              <>
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Transferir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

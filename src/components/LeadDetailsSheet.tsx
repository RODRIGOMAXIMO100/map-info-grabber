import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MessageCircle, 
  Phone, 
  Clock, 
  Bot, 
  User,
  AlertCircle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Loader2,
  Calendar,
  MessageSquare,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  RefreshCw,
  GitBranch,
  MapPin,
  Megaphone,
} from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatPhoneNumber } from '@/lib/phone';
import type { WhatsAppConversation } from '@/types/whatsapp';
import type { CRMFunnelStage } from '@/types/crm';
import { CRM_STAGES } from '@/types/whatsapp';

interface LeadDetailsSheetProps {
  conversation: WhatsAppConversation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
  stages?: CRMFunnelStage[];
  onStageChange?: (stageId: string) => void;
}

interface AILog {
  id: string;
  incoming_message: string | null;
  ai_response: string | null;
  detected_intent: string | null;
  bant_score: {
    budget?: boolean;
    authority?: boolean;
    need?: boolean;
    timing?: boolean;
  } | null;
  confidence_score: number | null;
  needs_human: boolean | null;
  created_at: string | null;
}

interface Message {
  id: string;
  content: string | null;
  direction: string;
  message_type: string;
  created_at: string | null;
}

export function LeadDetailsSheet({ conversation, open, onOpenChange, onUpdate, stages, onStageChange }: LeadDetailsSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [aiLogs, setAiLogs] = useState<AILog[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [assuming, setAssuming] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [localSummary, setLocalSummary] = useState<string | null>(null);
  const [summaryUpdatedAt, setSummaryUpdatedAt] = useState<string | null>(null);

  // Sync local summary state when conversation changes
  useEffect(() => {
    if (conversation) {
      setLocalSummary(conversation.conversation_summary || null);
      setSummaryUpdatedAt(conversation.summary_updated_at || null);
    }
  }, [conversation?.id, conversation?.conversation_summary, conversation?.summary_updated_at]);

  useEffect(() => {
    if (conversation && open) {
      loadData();
    }
  }, [conversation?.id, open]);

  const loadData = async () => {
    if (!conversation) return;
    setLoading(true);
    
    try {
      // Load AI logs, messages, and message count in parallel
      const [aiLogsResult, messagesResult, countResult] = await Promise.all([
        supabase
          .from('whatsapp_ai_logs')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('whatsapp_messages')
          .select('id, content, direction, message_type, created_at')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)
      ]);

      if (aiLogsResult.error) throw aiLogsResult.error;
      if (messagesResult.error) throw messagesResult.error;
      
      // Type assertion for bant_score
      const typedLogs = (aiLogsResult.data || []).map(log => ({
        ...log,
        bant_score: log.bant_score as AILog['bant_score']
      }));
      
      setAiLogs(typedLogs);
      setMessages(messagesResult.data || []);
      setMessageCount(countResult.count || 0);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };


  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCurrentStage = () => {
    if (!conversation?.tags) return null;
    const allStageLabels = CRM_STAGES.map(s => s.label_id);
    const stageLabel = conversation.tags.find(tag => allStageLabels.includes(tag));
    return CRM_STAGES.find(s => s.label_id === stageLabel);
  };

  const getLatestBANT = () => {
    const logWithBANT = aiLogs.find(log => log.bant_score);
    return logWithBANT?.bant_score || null;
  };

  const handleAssumeLeadAndChat = async () => {
    if (!conversation) return;
    setAssuming(true);
    
    try {
      // Pause AI and update handoff info
      await supabase
        .from('whatsapp_conversations')
        .update({
          ai_paused: true,
          ai_handoff_reason: 'Assumido manualmente pelo vendedor',
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      toast({
        title: 'Lead assumido',
        description: 'IA pausada. Você está no controle agora.',
      });

      onOpenChange(false);
      onUpdate?.();
      
      // Navigate to chat
      navigate(`/whatsapp/chat?phone=${encodeURIComponent(conversation.phone)}`);
    } catch (error) {
      console.error('Error assuming lead:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível assumir o lead.',
        variant: 'destructive'
      });
    } finally {
      setAssuming(false);
    }
  };

  const handleResumeAI = async () => {
    if (!conversation) return;
    
    try {
      await supabase
        .from('whatsapp_conversations')
        .update({
          ai_paused: false,
          ai_handoff_reason: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      toast({
        title: 'IA reativada',
        description: 'O agente de IA voltou a atender este lead.',
      });

      onUpdate?.();
    } catch (error) {
      console.error('Error resuming AI:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível reativar a IA.',
        variant: 'destructive'
      });
    }
  };

  const generateSummary = async () => {
    if (!conversation) return;
    setIsGeneratingSummary(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-conversation-summary', {
        body: { conversation_id: conversation.id }
      });

      if (error) throw error;
      
      if (data?.summary) {
        setLocalSummary(data.summary);
        setSummaryUpdatedAt(data.updated_at);
        sonnerToast.success('Resumo gerado com sucesso!');
        onUpdate?.();
      }
    } catch (err) {
      console.error('Error generating summary:', err);
      sonnerToast.error('Erro ao gerar resumo');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  if (!conversation) return null;

  const currentStage = getCurrentStage();
  const bant = getLatestBANT();
  const latestIntent = aiLogs.find(log => log.detected_intent)?.detected_intent;

  const BANTIcon = ({ value }: { value: boolean | undefined }) => {
    if (value === true) return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (value === false) return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getTimeSinceFirstContact = () => {
    if (!conversation?.created_at) return null;
    const created = new Date(conversation.created_at);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffDays > 0) {
      return `${diffDays} dia${diffDays > 1 ? 's' : ''}`;
    }
    if (diffHours > 0) {
      return `${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    }
    return 'Agora mesmo';
  };

  const hasAIInteraction = aiLogs.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md" aria-describedby="lead-details-description">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {conversation.name || formatPhoneNumber(conversation.phone)}
          </SheetTitle>
          <SheetDescription id="lead-details-description" className="sr-only">
            Detalhes do lead e histórico de conversa
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-140px)] mt-4">
          <div className="space-y-4 pr-4">
            {/* Info básica */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{formatPhoneNumber(conversation.phone)}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Última interação: {formatDate(conversation.last_message_at)}</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>Primeiro contato: {getTimeSinceFirstContact()} atrás</span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>{messageCount} mensagens trocadas</span>
              </div>

              {/* Origin info */}
              {(conversation.lead_city || conversation.broadcast_lists?.name) && (
                <div className="space-y-1.5 pt-2 border-t">
                  {conversation.lead_city && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{conversation.lead_city}{conversation.lead_state ? `, ${conversation.lead_state}` : ''}</span>
                    </div>
                  )}
                  {conversation.broadcast_lists?.name && (
                    <div className="flex items-center gap-2 text-sm">
                      <Megaphone className="h-4 w-4 text-muted-foreground" />
                      <span>Campanha: {conversation.broadcast_lists.name}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stage selector */}
              {stages && stages.length > 0 && onStageChange && (
                <div className="flex items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <Select 
                    value={conversation.funnel_stage || ''} 
                    onValueChange={(value) => onStageChange(value)}
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue placeholder="Selecione etapa" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: stage.color || '#888' }} 
                            />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {currentStage && !stages && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{currentStage.name}</Badge>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm">
                {conversation.ai_paused ? (
                  <Badge variant="outline" className="gap-1 border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                    <User className="h-3 w-3" /> Atendimento Manual
                  </Badge>
                ) : hasAIInteraction ? (
                  <Badge variant="secondary" className="gap-1">
                    <Bot className="h-3 w-3" /> IA Ativa
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300">
                    <Bot className="h-3 w-3" /> Lead Novo (sem interação IA)
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Resumo da Conversa */}
            <div>
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Resumo da Conversa
              </h4>
              {localSummary ? (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {localSummary}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    {summaryUpdatedAt && (
                      <span className="text-xs text-blue-500 dark:text-blue-400">
                        Atualizado {formatDistanceToNow(new Date(summaryUpdatedAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                      onClick={generateSummary}
                      disabled={isGeneratingSummary}
                    >
                      <RefreshCw className={`h-3 w-3 ${isGeneratingSummary ? 'animate-spin' : ''}`} />
                      Atualizar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={generateSummary}
                  disabled={isGeneratingSummary}
                >
                  {isGeneratingSummary ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Gerando resumo...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Gerar Resumo
                    </>
                  )}
                </Button>
              )}
            </div>

            <Separator />

            {/* BANT Score */}
            {bant && (
              <>
                <div>
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    📊 BANT Score
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <BANTIcon value={bant.budget} />
                      <span>Budget</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <BANTIcon value={bant.authority} />
                      <span>Authority</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <BANTIcon value={bant.need} />
                      <span>Need</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <BANTIcon value={bant.timing} />
                      <span>Timing</span>
                    </div>
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Handoff Reason */}
            {conversation.ai_handoff_reason && (
              <>
                <div>
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    Motivo do Handoff
                  </h4>
                  <p className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/30 rounded p-3 border border-orange-200 dark:border-orange-900">
                    {conversation.ai_handoff_reason}
                  </p>
                </div>
                <Separator />
              </>
            )}

            {/* Intent detectado */}
            {latestIntent && (
              <>
                <div>
                  <h4 className="font-medium text-sm mb-2">🎯 Intenção Detectada</h4>
                  <Badge variant="outline">{latestIntent}</Badge>
                </div>
                <Separator />
              </>
            )}

            {/* Última mensagem */}
            {conversation.last_message_preview && (
              <>
                <div>
                  <h4 className="font-medium text-sm mb-2">💬 Última Mensagem</h4>
                  <p className="text-sm text-muted-foreground bg-muted rounded p-3">
                    {conversation.last_message_preview}
                  </p>
                </div>
                <Separator />
              </>
            )}

            {/* Resumo da IA ou Últimas Mensagens */}
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : aiLogs.length > 0 ? (
              <div>
                <h4 className="font-medium text-sm mb-2">📝 Histórico IA (últimas interações)</h4>
                <div className="space-y-2">
                  {aiLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="text-xs bg-muted/50 rounded p-2 space-y-1">
                      {log.incoming_message && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Lead:</span> {log.incoming_message.slice(0, 100)}{log.incoming_message.length > 100 ? '...' : ''}
                        </p>
                      )}
                      {log.ai_response && (
                        <p>
                          <span className="font-medium text-primary">IA:</span> {log.ai_response.slice(0, 100)}{log.ai_response.length > 100 ? '...' : ''}
                        </p>
                      )}
                      {log.confidence_score && (
                        <Badge variant="outline" className="text-[10px]">
                          Confiança: {Math.round(log.confidence_score * 100)}%
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : messages.length > 0 ? (
              <div>
                <h4 className="font-medium text-sm mb-2">💬 Últimas Mensagens</h4>
                <div className="space-y-2">
                  {messages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`text-xs rounded p-2 ${
                        msg.direction === 'incoming' 
                          ? 'bg-muted/50' 
                          : 'bg-primary/10'
                      }`}
                    >
                      <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                        {msg.direction === 'incoming' ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        <span className="font-medium">
                          {msg.direction === 'incoming' ? 'Lead' : 'Você'}
                        </span>
                        <span className="ml-auto text-[10px]">
                          {formatDate(msg.created_at)}
                        </span>
                      </div>
                      <p className={msg.direction === 'incoming' ? 'text-foreground' : 'text-primary'}>
                        {msg.message_type === 'text' 
                          ? (msg.content?.slice(0, 150) || '[Mensagem vazia]') + (msg.content && msg.content.length > 150 ? '...' : '')
                          : `[${msg.message_type}]`
                        }
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma mensagem ainda</p>
                <p className="text-xs mt-1">Este lead ainda não iniciou conversa</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                onOpenChange(false);
                navigate(`/whatsapp/chat?phone=${encodeURIComponent(conversation.phone)}`);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              Chat
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              asChild
            >
              <a href={`tel:${conversation.phone}`}>
                <Phone className="h-4 w-4" />
                Ligar
              </a>
            </Button>
            {conversation.ai_paused ? (
              <Button
                variant="secondary"
                className="flex-1 gap-2"
                onClick={handleResumeAI}
              >
                <Bot className="h-4 w-4" />
                Reativar IA
              </Button>
            ) : (
              <Button
                variant="default"
                className="flex-1 gap-2"
                onClick={handleAssumeLeadAndChat}
                disabled={assuming}
              >
                {assuming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <User className="h-4 w-4" />
                )}
                Assumir
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

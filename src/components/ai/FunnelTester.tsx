import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, 
  RotateCcw, 
  FastForward, 
  CheckCircle2, 
  Circle, 
  Loader2,
  MessageSquare,
  Bot,
  User,
  AlertTriangle,
  Sparkles
} from 'lucide-react';

interface StagePrompt {
  stage_id: string;
  stage_name: string;
  objective: string;
  is_active: boolean;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  stage?: string;
  debug?: {
    should_advance?: boolean;
    should_send_video?: boolean;
    should_send_site?: boolean;
    should_handoff?: boolean;
    new_stage?: string;
  };
}

interface TestConversation {
  id: string;
  phone: string;
  funnel_stage: string;
  messages_in_current_stage: number;
}

// Mensagens de teste pré-definidas para simular um lead progredindo no funil
const TEST_MESSAGES: { stage: string; messages: string[] }[] = [
  {
    stage: 'STAGE_1',
    messages: [
      'Oi, vi sua mensagem',
      'Quem está falando?',
    ]
  },
  {
    stage: 'STAGE_1_TO_2',
    messages: [
      'Sou empresário, trabalho com consultoria há 5 anos',
      'Tenho uma empresa de serviços com 10 funcionários',
    ]
  },
  {
    stage: 'STAGE_2',
    messages: [
      'Minha maior dificuldade é captar clientes novos',
      'Gasto muito com tráfego pago mas não converto bem',
    ]
  },
  {
    stage: 'STAGE_2_TO_3',
    messages: [
      'Isso é urgente, preciso resolver esse mês',
      'Já perdi alguns clientes importantes',
    ]
  },
  {
    stage: 'STAGE_3',
    messages: [
      'Interessante, como funciona exatamente?',
      'Qual é o diferencial de vocês?',
    ]
  },
  {
    stage: 'STAGE_3_TO_4',
    messages: [
      'Gostei muito da proposta, quero saber mais',
      'Me interessei pela metodologia, parece eficiente',
    ]
  },
  {
    stage: 'STAGE_4',
    messages: [
      'Tenho disponibilidade terça às 14h',
      'Posso fazer uma call amanhã de manhã',
    ]
  },
  {
    stage: 'STAGE_4_TO_5',
    messages: [
      'Perfeito, pode agendar a reunião',
      'Vamos fechar, estou decidido',
    ]
  },
];

export default function FunnelTester() {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [stages, setStages] = useState<StagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  const [testConversation, setTestConversation] = useState<TestConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentStage, setCurrentStage] = useState('STAGE_1');
  
  const [debugInfo, setDebugInfo] = useState<{
    stage: string;
    objective: string;
    messagesInStage: number;
    lastResponse?: any;
  }>({
    stage: 'STAGE_1',
    objective: '',
    messagesInStage: 0,
  });

  useEffect(() => {
    loadStages();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadStages = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_stage_prompts')
        .select('stage_id, stage_name, objective, is_active')
        .order('stage_id');

      if (error) throw error;
      setStages(data || []);
    } catch (error) {
      console.error('Error loading stages:', error);
    } finally {
      setLoading(false);
    }
  };

  const startTest = async () => {
    setTesting(true);
    setMessages([]);
    setCurrentMessageIndex(0);
    setCurrentStage('STAGE_1');
    
    try {
      // Criar conversa de teste temporária
      const testPhone = `TEST_${Date.now()}`;
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: testPhone,
          name: '🧪 Teste de Funil',
          funnel_stage: 'new',
          status: 'active',
          origin: 'test',
          is_crm_lead: true,
        })
        .select()
        .single();

      if (error) throw error;

      setTestConversation({
        id: data.id,
        phone: testPhone,
        funnel_stage: 'new',
        messages_in_current_stage: 0,
      });

      setDebugInfo({
        stage: 'new',
        objective: stages.find(s => s.stage_id === 'STAGE_1')?.objective || '',
        messagesInStage: 0,
      });

      toast({
        title: 'Teste iniciado!',
        description: 'Clique em "Próxima Mensagem" para simular respostas do lead.',
      });
    } catch (error) {
      console.error('Error starting test:', error);
      toast({
        title: 'Erro ao iniciar teste',
        description: 'Não foi possível criar a conversa de teste.',
        variant: 'destructive',
      });
      setTesting(false);
    }
  };

  const sendNextMessage = async () => {
    if (!testConversation || processing) return;

    setProcessing(true);

    try {
      // Encontrar a próxima mensagem baseada no estágio atual
      const allMessages = TEST_MESSAGES.flatMap(group => group.messages);
      
      if (currentMessageIndex >= allMessages.length) {
        toast({
          title: 'Teste concluído!',
          description: 'Todas as mensagens de teste foram enviadas.',
        });
        setProcessing(false);
        return;
      }

      const userMessage = allMessages[currentMessageIndex];
      
      // Adicionar mensagem do usuário
      setMessages(prev => [...prev, { role: 'user', content: userMessage }]);

      // Chamar a edge function
      const { data: response, error } = await supabase.functions.invoke('whatsapp-ai-agent', {
        body: {
          conversation_id: testConversation.id,
          incoming_message: userMessage,
          is_test: true,
        },
      });

      if (error) throw error;

      // Buscar conversa atualizada
      const { data: updatedConv } = await supabase
        .from('whatsapp_conversations')
        .select('funnel_stage, messages_in_current_stage, ai_paused, ai_handoff_reason')
        .eq('id', testConversation.id)
        .single();

      const newStage = updatedConv?.funnel_stage || currentStage;
      
      // Adicionar resposta da IA
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response?.ai_response || 'Sem resposta',
        stage: newStage,
        debug: {
          should_advance: response?.stage_changed,
          should_send_video: response?.should_send_video,
          should_send_site: response?.should_send_site,
          should_handoff: updatedConv?.ai_paused,
          new_stage: newStage,
        },
      }]);

      // Atualizar estado
      setCurrentStage(newStage);
      setCurrentMessageIndex(prev => prev + 1);
      
      const stageInfo = stages.find(s => s.stage_id === newStage);
      setDebugInfo({
        stage: newStage,
        objective: stageInfo?.objective || '',
        messagesInStage: updatedConv?.messages_in_current_stage || 0,
        lastResponse: response,
      });

      // Verificar se chegou ao handoff
      if (updatedConv?.ai_paused) {
        toast({
          title: '🎉 Handoff atingido!',
          description: updatedConv.ai_handoff_reason || 'Lead pronto para consultor',
        });
      }

    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro ao processar mensagem',
        description: 'Verifique os logs da edge function.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const resetTest = async () => {
    if (testConversation) {
      // Deletar conversa de teste
      await supabase
        .from('whatsapp_messages')
        .delete()
        .eq('conversation_id', testConversation.id);
      
      await supabase
        .from('whatsapp_conversations')
        .delete()
        .eq('id', testConversation.id);
    }

    setTesting(false);
    setTestConversation(null);
    setMessages([]);
    setCurrentMessageIndex(0);
    setCurrentStage('STAGE_1');
    setDebugInfo({
      stage: 'STAGE_1',
      objective: '',
      messagesInStage: 0,
    });
  };

  const getStageColor = (stageId: string) => {
    const stageNum = parseInt(stageId.replace('STAGE_', '')) || 0;
    const colors = [
      'bg-blue-500',
      'bg-cyan-500', 
      'bg-emerald-500',
      'bg-amber-500',
      'bg-red-500',
    ];
    return colors[stageNum - 1] || 'bg-muted';
  };

  const isStageComplete = (stageId: string) => {
    const currentNum = parseInt(currentStage.replace('STAGE_', '').replace('new', '0')) || 0;
    const stageNum = parseInt(stageId.replace('STAGE_', '')) || 0;
    return stageNum < currentNum;
  };

  const isCurrentStage = (stageId: string) => {
    return currentStage === stageId || (currentStage === 'new' && stageId === 'STAGE_1');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com ações */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Simulador de Funil</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Teste o comportamento da IA em cada fase do funil
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {!testing ? (
                <Button onClick={startTest} className="gap-2">
                  <Play className="h-4 w-4" />
                  Iniciar Teste
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={resetTest} className="gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reiniciar
                  </Button>
                  <Button 
                    onClick={sendNextMessage} 
                    disabled={processing}
                    className="gap-2"
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FastForward className="h-4 w-4" />
                    )}
                    Próxima Mensagem
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {testing && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Progresso do Funil */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Progresso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stages.filter(s => s.is_active).map((stage) => (
                <div 
                  key={stage.stage_id}
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isCurrentStage(stage.stage_id) 
                      ? 'bg-primary/10 border border-primary/30' 
                      : ''
                  }`}
                >
                  {isStageComplete(stage.stage_id) ? (
                    <CheckCircle2 className={`h-5 w-5 ${getStageColor(stage.stage_id).replace('bg-', 'text-')}`} />
                  ) : isCurrentStage(stage.stage_id) ? (
                    <div className={`h-5 w-5 rounded-full ${getStageColor(stage.stage_id)} animate-pulse`} />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/50" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${
                      isCurrentStage(stage.stage_id) ? '' : 'text-muted-foreground'
                    }`}>
                      {stage.stage_name}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Chat Simulado */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Conversa Simulada
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] pr-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
                    <p>Clique em "Próxima Mensagem" para iniciar</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          {msg.debug && (
                            <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                              {msg.debug.should_advance && (
                                <Badge variant="outline" className="text-xs">
                                  ↗️ Avançou
                                </Badge>
                              )}
                              {msg.debug.should_send_video && (
                                <Badge variant="outline" className="text-xs">
                                  🎥 Vídeo
                                </Badge>
                              )}
                              {msg.debug.should_send_site && (
                                <Badge variant="outline" className="text-xs">
                                  🌐 Site
                                </Badge>
                              )}
                              {msg.debug.should_handoff && (
                                <Badge variant="destructive" className="text-xs">
                                  🔔 Handoff
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                            <User className="h-4 w-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Debug Info */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Debug
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fase Atual</p>
                <Badge className={getStageColor(debugInfo.stage)}>
                  {debugInfo.stage}
                </Badge>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-1">Objetivo</p>
                <p className="text-sm">{debugInfo.objective || '-'}</p>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-1">Msgs na fase</p>
                <p className="text-sm font-mono">{debugInfo.messagesInStage}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Progresso</p>
                <p className="text-sm font-mono">
                  {currentMessageIndex} / {TEST_MESSAGES.flatMap(g => g.messages).length} mensagens
                </p>
              </div>

              {debugInfo.lastResponse && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Última resposta</p>
                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify({
                      stage: debugInfo.lastResponse.new_stage,
                      video: debugInfo.lastResponse.should_send_video,
                      site: debugInfo.lastResponse.should_send_site,
                      handoff: debugInfo.lastResponse.should_handoff,
                    }, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

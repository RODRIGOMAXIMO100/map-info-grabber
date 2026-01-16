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
    messageType?: string;
    should_advance?: boolean;
    should_send_video?: boolean;
    should_send_site?: boolean;
    should_handoff?: boolean;
    new_stage?: string;
    detected_patterns?: string[];
  };
}

interface TestConversation {
  id: string;
  phone: string;
  funnel_stage: string;
  messages_in_current_stage: number;
}

// Cenários de teste para simular diferentes comportamentos de lead em cold outreach
const TEST_SCENARIOS = {
  coldOutreach: {
    name: '🧊 Cold Outreach Realista',
    description: 'Simula um lead que recebeu mensagem fria',
    messages: [
      { text: 'opa', type: 'cold' },
      { text: 'quem é você?', type: 'who_are_you' },
      { text: 'hmm', type: 'cold' },
      { text: 'trabalho com marketing digital', type: 'engaged' },
      { text: 'sim, tenho dificuldade em captar clientes', type: 'engaged' },
      { text: 'isso é urgente pra mim', type: 'engaged' },
      { text: 'quero saber mais', type: 'interested' },
      { text: 'pode agendar uma call', type: 'closing' },
    ],
  },
  botTest: {
    name: '🤖 Teste "É Bot?"',
    description: 'Simula lead perguntando se é robô',
    messages: [
      { text: 'oi', type: 'cold' },
      { text: 'você é um robô?', type: 'am_i_bot' },
      { text: 'ah tá, e o que vocês fazem?', type: 'who_are_you' },
      { text: 'interessante, me conta mais', type: 'engaged' },
    ],
  },
  superCold: {
    name: '❄️ Lead Super Frio',
    description: 'Simula respostas monossilábicas (deve ativar Fail Fast)',
    messages: [
      { text: 'oi', type: 'cold' },
      { text: 'ok', type: 'cold' },
      { text: 'hm', type: 'cold' },
      { text: 'não sei', type: 'cold' },
    ],
  },
  idealLead: {
    name: '🌟 Lead Ideal',
    description: 'Simula lead engajado desde o início',
    messages: [
      { text: 'Opa! Vi sua mensagem, fiquei curioso', type: 'engaged' },
      { text: 'Sou dono de uma agência de marketing, temos 15 funcionários', type: 'engaged' },
      { text: 'Nosso maior problema é escalar as vendas sem aumentar muito o custo', type: 'engaged' },
      { text: 'Isso é muito urgente, estamos perdendo clientes', type: 'engaged' },
      { text: 'Adorei a proposta! Quando podemos conversar?', type: 'closing' },
    ],
  },
  rejection: {
    name: '🚫 Lead com Rejeição',
    description: 'Simula lead que rejeita o contato',
    messages: [
      { text: 'quem é?', type: 'who_are_you' },
      { text: 'não tenho interesse', type: 'rejection' },
    ],
  },
};

type ScenarioKey = keyof typeof TEST_SCENARIOS;

export default function FunnelTester() {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [stages, setStages] = useState<StagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioKey>('coldOutreach');
  
  const [testConversation, setTestConversation] = useState<TestConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentStage, setCurrentStage] = useState('STAGE_1');
  
  const [debugInfo, setDebugInfo] = useState<{
    stage: string;
    objective: string;
    messagesInStage: number;
    lastResponse?: any;
    detectedPatterns?: string[];
  }>({
    stage: 'STAGE_1',
    objective: '',
    messagesInStage: 0,
  });

  const currentScenarioMessages = TEST_SCENARIOS[selectedScenario].messages;

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
      // Buscar funil padrão e primeiro estágio
      const { data: defaultFunnel } = await supabase
        .from('crm_funnels')
        .select('id')
        .eq('is_default', true)
        .maybeSingle();

      let defaultStageId: string | null = null;
      if (defaultFunnel?.id) {
        const { data: firstStage } = await supabase
          .from('crm_funnel_stages')
          .select('id')
          .eq('funnel_id', defaultFunnel.id)
          .order('stage_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        defaultStageId = firstStage?.id || null;
      }

      // Criar conversa de teste temporária
      const testPhone = `TEST_${Date.now()}`;
      
      const { data, error } = await supabase
        .from('whatsapp_conversations')
        .insert({
          phone: testPhone,
          name: '🧪 Teste de Funil',
          funnel_stage: defaultStageId || 'new',
          status: 'active',
          origin: 'test',
          is_crm_lead: true,
          crm_funnel_id: defaultFunnel?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      setTestConversation({
        id: data.id,
        phone: testPhone,
        funnel_stage: defaultStageId || 'new',
        messages_in_current_stage: 0,
      });

      setDebugInfo({
        stage: defaultStageId || 'new',
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
      // Encontrar a próxima mensagem do cenário selecionado
      if (currentMessageIndex >= currentScenarioMessages.length) {
        toast({
          title: 'Teste concluído!',
          description: `Cenário "${TEST_SCENARIOS[selectedScenario].name}" finalizado.`,
        });
        setProcessing(false);
        return;
      }

      const messageData = currentScenarioMessages[currentMessageIndex];
      const userMessage = messageData.text;
      
      // Adicionar mensagem do usuário com tipo
      setMessages(prev => [...prev, { 
        role: 'user', 
        content: userMessage,
        debug: { messageType: messageData.type }
      }]);

      // Chamar a edge function
      // Construir histórico de mensagens para enviar à IA
      const conversationHistory = messages.map(msg => ({
        direction: msg.role === 'user' ? 'incoming' : 'outgoing',
        content: msg.content
      }));

      const { data: response, error } = await supabase.functions.invoke('whatsapp-ai-agent', {
        body: {
          conversation_id: testConversation.id,
          incoming_message: userMessage,
          conversation_history: conversationHistory,
          current_stage_id: currentStage,
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
        content: response?.response || 'Sem resposta',
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
      {/* Seleção de Cenário */}
      {!testing && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {(Object.keys(TEST_SCENARIOS) as ScenarioKey[]).map((key) => {
            const scenario = TEST_SCENARIOS[key];
            return (
              <Card 
                key={key}
                className={`cursor-pointer transition-all hover:border-primary/50 ${
                  selectedScenario === key ? 'border-primary bg-primary/5' : ''
                }`}
                onClick={() => setSelectedScenario(key)}
              >
                <CardContent className="p-4">
                  <p className="font-medium text-sm">{scenario.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{scenario.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {scenario.messages.length} mensagens
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Header com ações */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>
                  {testing ? TEST_SCENARIOS[selectedScenario].name : 'Simulador de Funil'}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {testing 
                    ? TEST_SCENARIOS[selectedScenario].description 
                    : 'Selecione um cenário e clique em Iniciar Teste'}
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
                              {msg.debug.messageType && (
                                <Badge variant="secondary" className="text-xs">
                                  {msg.debug.messageType === 'cold' && '🧊 Frio'}
                                  {msg.debug.messageType === 'who_are_you' && '❓ Quem é você'}
                                  {msg.debug.messageType === 'am_i_bot' && '🤖 É bot?'}
                                  {msg.debug.messageType === 'engaged' && '💬 Engajado'}
                                  {msg.debug.messageType === 'interested' && '✨ Interessado'}
                                  {msg.debug.messageType === 'closing' && '🎯 Fechamento'}
                                  {msg.debug.messageType === 'rejection' && '🚫 Rejeição'}
                                </Badge>
                              )}
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
                  {currentMessageIndex} / {currentScenarioMessages.length} mensagens
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

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  MessageSquare,
  Target,
  TrendingUp,
  Search,
  RefreshCw,
  Eye,
  Calendar,
  DollarSign,
  UserCheck,
  Zap,
  Clock,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BANTScore {
  budget: number | null;
  authority: number | null;
  need: number | null;
  timing: number | null;
}

interface AILog {
  id: string;
  conversation_id: string | null;
  incoming_message: string | null;
  ai_response: string | null;
  detected_intent: string | null;
  confidence_score: number | null;
  needs_human: boolean | null;
  applied_label_id: string | null;
  created_at: string | null;
  bant_score: BANTScore | Record<string, unknown> | null;
  conversation?: {
    name: string | null;
    phone: string;
  };
}

const INTENT_COLORS: Record<string, string> = {
  interesse: "bg-green-500/20 text-green-400 border-green-500/30",
  duvida: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  objecao: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  desinteresse: "bg-red-500/20 text-red-400 border-red-500/30",
  qualificado: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  saudacao: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  default: "bg-muted text-muted-foreground border-border",
};

const STAGE_LABELS: Record<string, string> = {
  "16": "Lead Novo",
  "13": "MQL - Respondeu",
  "14": "Engajado",
  "20": "SQL - Qualificado",
  "21": "Handoff - Vendedor",
  "22": "Em Negociação",
  "23": "Fechado/Perdido",
};

export default function AILogs() {
  const [logs, setLogs] = useState<AILog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<AILog | null>(null);
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [stats, setStats] = useState({
    total: 0,
    needsHuman: 0,
    avgConfidence: 0,
    intents: {} as Record<string, number>,
  });

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_ai_logs")
        .select(`
          *,
          conversation:whatsapp_conversations(name, phone)
        `)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      const typedLogs = (data || []) as AILog[];
      setLogs(typedLogs);

      // Calcular estatísticas
      const total = typedLogs.length;
      const needsHuman = typedLogs.filter((l) => l.needs_human).length;
      const confidenceSum = typedLogs.reduce(
        (sum, l) => sum + (l.confidence_score || 0),
        0
      );
      const avgConfidence = total > 0 ? confidenceSum / total : 0;

      const intents: Record<string, number> = {};
      typedLogs.forEach((log) => {
        const intent = log.detected_intent || "sem_intent";
        intents[intent] = (intents[intent] || 0) + 1;
      });

      setStats({ total, needsHuman, avgConfidence, intents });
    } catch (error) {
      console.error("Error loading logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      log.incoming_message?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ai_response?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.conversation?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.conversation?.phone?.includes(searchTerm);

    const matchesIntent =
      intentFilter === "all" || log.detected_intent === intentFilter;

    return matchesSearch && matchesIntent;
  });

  const getIntentBadgeClass = (intent: string | null) => {
    if (!intent) return INTENT_COLORS.default;
    return INTENT_COLORS[intent.toLowerCase()] || INTENT_COLORS.default;
  };

  const uniqueIntents = [...new Set(logs.map((l) => l.detected_intent).filter(Boolean))];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            Logs da IA
          </h1>
          <p className="text-muted-foreground mt-1">
            Histórico de todas as interações e análises do agente IA
          </p>
        </div>
        <Button onClick={loadLogs} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total de Interações</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Target className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.needsHuman}</p>
                <p className="text-sm text-muted-foreground">Handoffs Realizados</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {(stats.avgConfidence * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground">Confiança Média</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Brain className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {Object.keys(stats.intents).length}
                </p>
                <p className="text-sm text-muted-foreground">Intents Detectados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por mensagem, resposta ou contato..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por Intent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Intents</SelectItem>
                {uniqueIntents.map((intent) => (
                  <SelectItem key={intent} value={intent!}>
                    {intent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Histórico de Interações ({filteredLogs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-muted/50">
                  <TableHead className="text-muted-foreground">Data/Hora</TableHead>
                  <TableHead className="text-muted-foreground">Contato</TableHead>
                  <TableHead className="text-muted-foreground">Mensagem</TableHead>
                  <TableHead className="text-muted-foreground">Intent</TableHead>
                  <TableHead className="text-muted-foreground">BANT</TableHead>
                  <TableHead className="text-muted-foreground">Estágio</TableHead>
                  <TableHead className="text-muted-foreground">Handoff</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Nenhum log encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="border-border hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-sm">
                        {log.created_at
                          ? format(new Date(log.created_at), "dd/MM HH:mm", {
                              locale: ptBR,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {log.conversation?.name || "Sem nome"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {log.conversation?.phone || "-"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="truncate text-sm text-muted-foreground">
                          {log.incoming_message || "-"}
                        </p>
                      </TableCell>
                      <TableCell>
                        {log.detected_intent ? (
                          <Badge
                            variant="outline"
                            className={getIntentBadgeClass(log.detected_intent)}
                          >
                            {log.detected_intent}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.bant_score ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                {[
                                  { key: 'budget', icon: DollarSign, label: 'B', color: 'text-green-500' },
                                  { key: 'authority', icon: UserCheck, label: 'A', color: 'text-blue-500' },
                                  { key: 'need', icon: Zap, label: 'N', color: 'text-amber-500' },
                                  { key: 'timing', icon: Clock, label: 'T', color: 'text-purple-500' },
                                ].map(({ key, label, color }) => {
                                  const value = (log.bant_score as BANTScore)?.[key as keyof BANTScore];
                                  const hasValue = value !== null && value !== undefined;
                                  return (
                                    <span
                                      key={key}
                                      className={`text-xs font-bold ${hasValue ? color : 'text-muted-foreground/40'}`}
                                    >
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-3">
                              <div className="space-y-1 text-sm">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-3 w-3 text-green-500" />
                                  <span>Budget: {(log.bant_score as BANTScore)?.budget ?? '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <UserCheck className="h-3 w-3 text-blue-500" />
                                  <span>Authority: {(log.bant_score as BANTScore)?.authority ?? '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Zap className="h-3 w-3 text-amber-500" />
                                  <span>Need: {(log.bant_score as BANTScore)?.need ?? '-'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-3 w-3 text-purple-500" />
                                  <span>Timing: {(log.bant_score as BANTScore)?.timing ?? '-'}</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.applied_label_id ? (
                          <Badge variant="secondary" className="text-xs">
                            {STAGE_LABELS[log.applied_label_id] || log.applied_label_id}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {log.needs_human ? (
                          <Badge variant="destructive" className="text-xs">
                            Sim
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                          >
                            Não
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Detalhes da Interação
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-6">
              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Contato</p>
                  <p className="font-medium">
                    {selectedLog.conversation?.name || "Sem nome"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedLog.conversation?.phone}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data/Hora</p>
                  <p className="font-medium">
                    {selectedLog.created_at
                      ? format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", {
                          locale: ptBR,
                        })
                      : "-"}
                  </p>
                </div>
              </div>

              {/* Intent & Confidence */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Intent Detectado</p>
                  {selectedLog.detected_intent ? (
                    <Badge
                      variant="outline"
                      className={getIntentBadgeClass(selectedLog.detected_intent)}
                    >
                      {selectedLog.detected_intent}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Confiança</p>
                  <p className="text-lg font-bold">
                    {selectedLog.confidence_score !== null
                      ? `${(selectedLog.confidence_score * 100).toFixed(0)}%`
                      : "-"}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Estágio Aplicado</p>
                  {selectedLog.applied_label_id ? (
                    <Badge variant="secondary">
                      {STAGE_LABELS[selectedLog.applied_label_id] ||
                        selectedLog.applied_label_id}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </Card>
              </div>

              {/* BANT Score Detail */}
              {selectedLog.bant_score && (
                <Card className="p-4">
                  <p className="text-sm font-medium text-muted-foreground mb-3">BANT Score</p>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="flex flex-col items-center p-3 bg-green-500/10 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-500 mb-1" />
                      <span className="text-xs text-muted-foreground">Budget</span>
                      <span className="text-lg font-bold text-foreground">
                        {(selectedLog.bant_score as BANTScore)?.budget ?? '-'}
                      </span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-blue-500/10 rounded-lg">
                      <UserCheck className="h-5 w-5 text-blue-500 mb-1" />
                      <span className="text-xs text-muted-foreground">Authority</span>
                      <span className="text-lg font-bold text-foreground">
                        {(selectedLog.bant_score as BANTScore)?.authority ?? '-'}
                      </span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-amber-500/10 rounded-lg">
                      <Zap className="h-5 w-5 text-amber-500 mb-1" />
                      <span className="text-xs text-muted-foreground">Need</span>
                      <span className="text-lg font-bold text-foreground">
                        {(selectedLog.bant_score as BANTScore)?.need ?? '-'}
                      </span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-purple-500/10 rounded-lg">
                      <Clock className="h-5 w-5 text-purple-500 mb-1" />
                      <span className="text-xs text-muted-foreground">Timing</span>
                      <span className="text-lg font-bold text-foreground">
                        {(selectedLog.bant_score as BANTScore)?.timing ?? '-'}
                      </span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Handoff */}
              {selectedLog.needs_human && (
                <Card className="p-4 border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2 text-amber-500">
                    <Target className="h-4 w-4" />
                    <span className="font-medium">Handoff Solicitado</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Esta interação foi encaminhada para um atendente humano.
                  </p>
                </Card>
              )}

              {/* Messages */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Mensagem Recebida
                  </p>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-foreground whitespace-pre-wrap">
                      {selectedLog.incoming_message || "Sem conteúdo"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Resposta da IA
                  </p>
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-foreground whitespace-pre-wrap">
                      {selectedLog.ai_response || "Sem resposta"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

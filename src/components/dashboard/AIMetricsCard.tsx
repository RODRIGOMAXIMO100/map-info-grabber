import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Bot, MessageSquare, AlertCircle, Zap } from "lucide-react";
import type { AIMetricsData } from "@/hooks/useDashboardData";

interface AIMetricsCardProps {
  data: AIMetricsData;
  loading?: boolean;
}

export default function AIMetricsCard({ data, loading = false }: AIMetricsCardProps) {

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" />
            Performance IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5" />
          Performance IA
          <div className="ml-auto flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${data.isActive ? 'bg-green-500' : 'bg-muted-foreground'}`} />
            <span className="text-xs font-normal text-muted-foreground">
              {data.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </CardTitle>
        <CardDescription className="text-xs">
          Período selecionado
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Main stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <MessageSquare className="h-3 w-3" />
              Respostas
            </div>
            <p className="text-xl font-bold">{data.totalResponses}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <AlertCircle className="h-3 w-3" />
              Handoffs
            </div>
            <p className="text-xl font-bold">{data.handoffCount}</p>
          </div>
        </div>

        {/* Handoff rate */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Taxa de Handoff</span>
            <span className="font-medium">{data.handoffRate}%</span>
          </div>
          <Progress 
            value={data.handoffRate} 
            className="h-2"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {data.handoffRate < 20 ? '✓ Ótimo' : data.handoffRate < 40 ? '⚠ Moderado' : '⚠ Alto'}
          </p>
        </div>

        {/* Avg response */}
        <div className="flex items-center justify-between p-2 rounded-lg border">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Média caracteres</span>
          </div>
          <span className="font-medium text-sm">{data.avgResponseChars}</span>
        </div>

        {/* Top intents */}
        {data.topIntents.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Intenções mais detectadas</p>
            <div className="flex flex-wrap gap-1">
              {data.topIntents.map(({ intent, count }) => (
                <Badge key={intent} variant="secondary" className="text-xs">
                  {intent} ({count})
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Shield, Clock, AlertTriangle, Ban, Zap, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ProtectionSettings {
  id: string;
  daily_limit_warmup: number;
  daily_limit_normal: number;
  warmup_days: number;
  batch_size: number;
  pause_after_batch_minutes: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  auto_blacklist_enabled: boolean;
  block_detection_enabled: boolean;
  max_consecutive_errors: number;
}

interface InstanceLimit {
  id: string;
  config_id: string;
  date: string;
  messages_sent: number;
  consecutive_errors: number;
  is_paused: boolean;
  pause_reason: string | null;
  config_name?: string;
  config_phone?: string;
  daily_limit?: number;
}

interface BlacklistEntry {
  id: string;
  phone: string;
  reason: string;
  keyword_matched: string | null;
  added_at: string;
}

export default function AntiBlockConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ProtectionSettings | null>(null);
  const [instanceLimits, setInstanceLimits] = useState<InstanceLimit[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load settings
      const { data: settingsData } = await supabase
        .from('whatsapp_protection_settings')
        .select('*')
        .limit(1)
        .single();

      if (settingsData) {
        setSettings(settingsData as ProtectionSettings);
      }

      // Load today's instance limits with config info
      const today = new Date().toISOString().split('T')[0];
      const { data: limitsData } = await supabase
        .from('whatsapp_instance_limits')
        .select('*, config:whatsapp_config(name, instance_phone, warmup_started_at)')
        .eq('date', today);

      if (limitsData) {
        const warmupDays = settingsData?.warmup_days || 7;
        setInstanceLimits(limitsData.map((l: any) => {
          const warmupStart = l.config?.warmup_started_at ? new Date(l.config.warmup_started_at) : new Date();
          const daysSinceStart = Math.floor((Date.now() - warmupStart.getTime()) / (1000 * 60 * 60 * 24));
          const isWarmup = daysSinceStart < warmupDays;
          
          return {
            ...l,
            config_name: l.config?.name || 'Sem nome',
            config_phone: l.config?.instance_phone,
            daily_limit: isWarmup ? settingsData?.daily_limit_warmup : settingsData?.daily_limit_normal
          };
        }));
      }

      // Load blacklist
      const { data: blacklistData } = await supabase
        .from('whatsapp_blacklist')
        .select('*')
        .order('added_at', { ascending: false })
        .limit(100);

      if (blacklistData) {
        setBlacklist(blacklistData as BlacklistEntry[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_protection_settings')
        .update({
          daily_limit_warmup: settings.daily_limit_warmup,
          daily_limit_normal: settings.daily_limit_normal,
          warmup_days: settings.warmup_days,
          batch_size: settings.batch_size,
          pause_after_batch_minutes: settings.pause_after_batch_minutes,
          min_delay_seconds: settings.min_delay_seconds,
          max_delay_seconds: settings.max_delay_seconds,
          business_hours_enabled: settings.business_hours_enabled,
          business_hours_start: settings.business_hours_start,
          business_hours_end: settings.business_hours_end,
          auto_blacklist_enabled: settings.auto_blacklist_enabled,
          block_detection_enabled: settings.block_detection_enabled,
          max_consecutive_errors: settings.max_consecutive_errors,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: 'Configurações salvas!',
        description: 'As proteções anti-bloqueio foram atualizadas.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as configurações.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromBlacklist = async (id: string) => {
    try {
      await supabase.from('whatsapp_blacklist').delete().eq('id', id);
      setBlacklist(prev => prev.filter(b => b.id !== id));
      toast({ title: 'Número removido da blacklist' });
    } catch (error) {
      toast({ title: 'Erro ao remover', variant: 'destructive' });
    }
  };

  const handleUnpauseInstance = async (limitId: string) => {
    try {
      await supabase
        .from('whatsapp_instance_limits')
        .update({ is_paused: false, pause_until: null, pause_reason: null })
        .eq('id', limitId);
      
      setInstanceLimits(prev => prev.map(l => 
        l.id === limitId ? { ...l, is_paused: false, pause_reason: null } : l
      ));
      toast({ title: 'Instância despausada' });
    } catch (error) {
      toast({ title: 'Erro ao despausar', variant: 'destructive' });
    }
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
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Shield className="h-6 w-6 text-green-500" />
                Proteção Anti-Bloqueio
              </h1>
              <p className="text-muted-foreground">Configure limites e proteções para evitar bloqueios</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Configurações
          </Button>
        </div>

        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings" className="gap-2">
              <Zap className="h-4 w-4" />
              Configurações
            </TabsTrigger>
            <TabsTrigger value="status" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Status das Instâncias
            </TabsTrigger>
            <TabsTrigger value="blacklist" className="gap-2">
              <Ban className="h-4 w-4" />
              Blacklist ({blacklist.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4">
            {settings && (
              <>
                {/* Limites Diários */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Limites Diários por Número
                    </CardTitle>
                    <CardDescription>
                      Controla quantas mensagens cada número pode enviar por dia
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label>Limite Warmup (números novos)</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.daily_limit_warmup]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, daily_limit_warmup: v } : null)}
                            max={100}
                            min={10}
                            step={5}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.daily_limit_warmup}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">msgs/dia para números na fase de aquecimento</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Limite Normal</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.daily_limit_normal]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, daily_limit_normal: v } : null)}
                            max={500}
                            min={50}
                            step={10}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.daily_limit_normal}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">msgs/dia para números já aquecidos</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Período de Warmup</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.warmup_days]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, warmup_days: v } : null)}
                            max={30}
                            min={3}
                            step={1}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.warmup_days}d</span>
                        </div>
                        <p className="text-xs text-muted-foreground">dias até o número sair do warmup</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Pausas e Delays */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-500" />
                      Pausas Inteligentes e Delays
                    </CardTitle>
                    <CardDescription>
                      Simula comportamento humano com pausas e intervalos
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Tamanho do Lote</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.batch_size]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, batch_size: v } : null)}
                            max={100}
                            min={10}
                            step={5}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.batch_size}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">mensagens antes de pausar</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Pausa Entre Lotes</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.pause_after_batch_minutes]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, pause_after_batch_minutes: v } : null)}
                            max={120}
                            min={15}
                            step={5}
                            className="flex-1"
                          />
                          <span className="font-mono w-16 text-right">{settings.pause_after_batch_minutes}min</span>
                        </div>
                        <p className="text-xs text-muted-foreground">minutos de pausa após cada lote</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label>Delay Mínimo</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.min_delay_seconds]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, min_delay_seconds: v } : null)}
                            max={60}
                            min={5}
                            step={1}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.min_delay_seconds}s</span>
                        </div>
                        <p className="text-xs text-muted-foreground">segundos entre mensagens (mín)</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Delay Máximo</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[settings.max_delay_seconds]}
                            onValueChange={([v]) => setSettings(s => s ? { ...s, max_delay_seconds: v } : null)}
                            max={120}
                            min={15}
                            step={1}
                            className="flex-1"
                          />
                          <span className="font-mono w-12 text-right">{settings.max_delay_seconds}s</span>
                        </div>
                        <p className="text-xs text-muted-foreground">segundos entre mensagens (máx)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Horário Comercial */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Horário Comercial</CardTitle>
                        <CardDescription>Enviar mensagens apenas em horário comercial</CardDescription>
                      </div>
                      <Switch
                        checked={settings.business_hours_enabled}
                        onCheckedChange={(checked) => setSettings(s => s ? { ...s, business_hours_enabled: checked } : null)}
                      />
                    </div>
                  </CardHeader>
                  {settings.business_hours_enabled && (
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Início</Label>
                          <Input
                            type="time"
                            value={settings.business_hours_start.slice(0, 5)}
                            onChange={(e) => setSettings(s => s ? { ...s, business_hours_start: e.target.value + ':00' } : null)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Fim</Label>
                          <Input
                            type="time"
                            value={settings.business_hours_end.slice(0, 5)}
                            onChange={(e) => setSettings(s => s ? { ...s, business_hours_end: e.target.value + ':00' } : null)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Proteções */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-green-500" />
                      Proteções Automáticas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">Blacklist Automática</p>
                        <p className="text-sm text-muted-foreground">
                          Adiciona automaticamente quem responder "SAIR", "PARAR", etc.
                        </p>
                      </div>
                      <Switch
                        checked={settings.auto_blacklist_enabled}
                        onCheckedChange={(checked) => setSettings(s => s ? { ...s, auto_blacklist_enabled: checked } : null)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">Detecção de Bloqueio</p>
                        <p className="text-sm text-muted-foreground">
                          Pausa automaticamente a instância se detectar bloqueio
                        </p>
                      </div>
                      <Switch
                        checked={settings.block_detection_enabled}
                        onCheckedChange={(checked) => setSettings(s => s ? { ...s, block_detection_enabled: checked } : null)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Máx. Erros Consecutivos</Label>
                      <div className="flex items-center gap-4">
                        <Slider
                          value={[settings.max_consecutive_errors]}
                          onValueChange={([v]) => setSettings(s => s ? { ...s, max_consecutive_errors: v } : null)}
                          max={20}
                          min={3}
                          step={1}
                          className="flex-1"
                        />
                        <span className="font-mono w-8 text-right">{settings.max_consecutive_errors}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Número de erros consecutivos antes de pausar a instância
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="status">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status das Instâncias Hoje</CardTitle>
                <CardDescription>
                  Mensagens enviadas e limites de cada instância
                </CardDescription>
              </CardHeader>
              <CardContent>
                {instanceLimits.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhuma instância enviou mensagens hoje
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Instância</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Enviadas Hoje</TableHead>
                        <TableHead>Limite</TableHead>
                        <TableHead>Erros</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {instanceLimits.map((limit) => (
                        <TableRow key={limit.id}>
                          <TableCell className="font-medium">{limit.config_name}</TableCell>
                          <TableCell className="font-mono text-sm">{limit.config_phone || '-'}</TableCell>
                          <TableCell>
                            <span className="font-mono">{limit.messages_sent}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">{limit.daily_limit}</span>
                          </TableCell>
                          <TableCell>
                            <span className={limit.consecutive_errors > 0 ? 'text-red-500 font-medium' : ''}>
                              {limit.consecutive_errors}
                            </span>
                          </TableCell>
                          <TableCell>
                            {limit.is_paused ? (
                              <Badge variant="destructive">Pausada</Badge>
                            ) : limit.messages_sent >= (limit.daily_limit || 200) ? (
                              <Badge variant="secondary">Limite Atingido</Badge>
                            ) : (
                              <Badge variant="default" className="bg-green-500">Ativa</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {limit.is_paused && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleUnpauseInstance(limit.id)}
                              >
                                Despausar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="blacklist">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Números na Blacklist</CardTitle>
                <CardDescription>
                  Estes números não receberão mais mensagens de broadcast
                </CardDescription>
              </CardHeader>
              <CardContent>
                {blacklist.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhum número na blacklist
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Motivo</TableHead>
                        <TableHead>Keyword</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blacklist.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">{entry.phone}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{entry.reason}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {entry.keyword_matched || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(entry.added_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => handleRemoveFromBlacklist(entry.id)}
                            >
                              Remover
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

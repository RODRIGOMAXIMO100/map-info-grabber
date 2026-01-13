import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, Image, X, Users, MessageSquare, MapPin, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FollowupFiltersPanel, type FollowupFilters } from './FollowupFiltersPanel';
import { SelectedLeadsPreview, type SelectedLead } from './SelectedLeadsPreview';

export function SegmentedFollowup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [filters, setFilters] = useState<FollowupFilters>({
    cities: [],
    funnelStages: [],
    broadcastListId: null,
    responded: 'all',
    maxFollowupCount: null,
    minDaysSinceBroadcast: null,
  });
  
  const [leads, setLeads] = useState<SelectedLead[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  
  const [campaignName, setCampaignName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Stats
  const [stats, setStats] = useState({
    totalAvailable: 0,
    noResponse: 0,
    uniqueCities: 0,
  });

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('whatsapp_conversations')
        .select('id, phone, name, lead_city, funnel_stage, last_message_at, broadcast_sent_at, followup_count, last_lead_message_at')
        .eq('is_crm_lead', true)
        .not('broadcast_sent_at', 'is', null);

      // Apply filters
      if (filters.cities.length > 0) {
        query = query.in('lead_city', filters.cities);
      }

      if (filters.funnelStages.length > 0) {
        query = query.in('funnel_stage', filters.funnelStages);
      }

      if (filters.broadcastListId) {
        query = query.eq('broadcast_list_id', filters.broadcastListId);
      }

      if (filters.responded === 'no') {
        query = query.is('last_lead_message_at', null);
      } else if (filters.responded === 'yes') {
        query = query.not('last_lead_message_at', 'is', null);
      }

      if (filters.maxFollowupCount !== null) {
        query = query.or(`followup_count.is.null,followup_count.lte.${filters.maxFollowupCount}`);
      }

      if (filters.minDaysSinceBroadcast !== null) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filters.minDaysSinceBroadcast);
        query = query.lt('broadcast_sent_at', cutoffDate.toISOString());
      }

      const { data, error } = await query.order('broadcast_sent_at', { ascending: false });

      if (error) throw error;

      setLeads(data || []);
      setExcludedIds(new Set());

      // Calculate stats
      const uniqueCitiesSet = new Set(data?.map(l => l.lead_city).filter(Boolean));
      const noResponseCount = data?.filter(l => !l.last_lead_message_at).length || 0;
      
      setStats({
        totalAvailable: data?.length || 0,
        noResponse: noResponseCount,
        uniqueCities: uniqueCitiesSet.size,
      });

    } catch (error) {
      console.error('Error loading leads:', error);
      toast({
        title: 'Erro ao carregar leads',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const toggleExclude = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const excludeAll = () => {
    setExcludedIds(new Set(leads.map(l => l.id)));
  };

  const includeAll = () => {
    setExcludedIds(new Set());
  };

  const createFollowupCampaign = async () => {
    const selectedLeads = leads.filter(l => !excludedIds.has(l.id));
    
    if (selectedLeads.length === 0) {
      toast({
        title: 'Nenhum lead selecionado',
        description: 'Selecione pelo menos um lead para criar a campanha.',
        variant: 'destructive',
      });
      return;
    }

    if (!campaignName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe um nome para a campanha.',
        variant: 'destructive',
      });
      return;
    }

    if (!messageTemplate.trim()) {
      toast({
        title: 'Mensagem obrigatória',
        description: 'Configure a mensagem do follow-up.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const phones = selectedLeads.map(l => l.phone);
      const leadData = selectedLeads.map(l => ({
        phone: l.phone,
        name: l.name,
        city: l.lead_city,
      }));

      // Create broadcast list
      const { data: list, error: listError } = await supabase
        .from('broadcast_lists')
        .insert({
          name: campaignName,
          description: `Follow-up segmentado - ${selectedLeads.length} leads`,
          message_template: messageTemplate,
          image_url: imageUrl || null,
          phones,
          lead_data: leadData,
          status: 'draft',
        })
        .select()
        .single();

      if (listError) throw listError;

      toast({
        title: 'Campanha criada!',
        description: `${selectedLeads.length} leads adicionados à campanha.`,
      });

      // Navigate to the campaign details
      navigate(`/whatsapp/broadcast/${list.id}`);

    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: 'Erro ao criar campanha',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = leads.length - excludedIds.size;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalAvailable}</p>
                <p className="text-xs text-muted-foreground">Leads disponíveis</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.noResponse}</p>
                <p className="text-xs text-muted-foreground">Sem resposta</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.uniqueCities}</p>
                <p className="text-xs text-muted-foreground">Cidades</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{selectedCount}</p>
                <p className="text-xs text-muted-foreground">Selecionados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Filters Panel */}
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <FollowupFiltersPanel filters={filters} onFiltersChange={setFilters} />
          </CardContent>
        </Card>

        {/* Leads Preview */}
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <SelectedLeadsPreview
              leads={leads}
              excludedIds={excludedIds}
              onToggleExclude={toggleExclude}
              onExcludeAll={excludeAll}
              onIncludeAll={includeAll}
              loading={loading}
            />
          </CardContent>
        </Card>
      </div>

      {/* Message Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configurar Follow-up</CardTitle>
          <CardDescription>
            Configure a mensagem que será enviada para os leads selecionados.
            Use {'{nome}'} e {'{cidade}'} para personalização.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Nome da Campanha *</Label>
              <Input
                placeholder="Ex: Follow-up Leads Uberlândia"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>URL da Imagem (opcional)</Label>
              <Input
                placeholder="https://exemplo.com/imagem.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Mensagem do Follow-up *</Label>
            <Textarea
              placeholder="Olá {nome}! Vi que você é de {cidade}. Gostaria de retomar nossa conversa..."
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: {'{nome}'}, {'{cidade}'}
            </p>
          </div>

          <div className="flex justify-end gap-4">
            <Button
              onClick={createFollowupCampaign}
              disabled={creating || selectedCount === 0}
              className="gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Criar Campanha ({selectedCount} leads)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

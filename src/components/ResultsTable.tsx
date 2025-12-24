import { useState, useEffect } from 'react';
import { ExternalLink, Star, Phone, MapPin, MessageCircle, Instagram, Map, Sparkles, Mail, Facebook, Linkedin, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/types/business';
import { calculateLeadScore, getScoreBadgeColor } from '@/lib/leadScoring';
import type { BroadcastList, LeadData } from '@/types/whatsapp';

// Quality badge component
function QualityBadge({ business }: { business: Business }) {
  const { score, level, reasons } = calculateLeadScore(business);
  
  const levelLabel = level === 'alta' ? 'Alta Qualidade' : level === 'media' ? 'Média Qualidade' : 'Baixa Qualidade';
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 text-xs ${getScoreBadgeColor(level)}`}>
            <Award className="h-3 w-3" />
            {score.toFixed(1)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="font-medium mb-1">{levelLabel}</p>
          <ul className="text-xs space-y-0.5">
            {reasons.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ResultsTableProps {
  results: Business[];
}

export function ResultsTable({ results }: ResultsTableProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [broadcastLists, setBroadcastLists] = useState<BroadcastList[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [newListName, setNewListName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadBroadcastLists();
  }, []);

  const loadBroadcastLists = async () => {
    const { data } = await supabase
      .from('broadcast_lists')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) {
      const typedData = data.map(item => ({
        ...item,
        status: item.status as BroadcastList['status'],
        lead_data: (Array.isArray(item.lead_data) ? item.lead_data : []) as unknown as LeadData[],
      }));
      setBroadcastLists(typedData);
    }
  };

  const toggleSelect = (placeId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(placeId)) {
        newSet.delete(placeId);
      } else {
        newSet.add(placeId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.place_id)));
    }
  };

  const getSelectedBusinesses = () => {
    return results.filter(r => selectedIds.has(r.place_id));
  };

  const handleAddToList = async () => {
    const selectedBusinesses = getSelectedBusinesses();
    if (selectedBusinesses.length === 0) return;

    setIsAdding(true);
    try {
      let listId = selectedListId;

      // Create new list if needed
      if (selectedListId === 'new' && newListName) {
        const { data: newList, error: createError } = await supabase
          .from('broadcast_lists')
          .insert({
            name: newListName,
            status: 'draft',
            phones: [],
            lead_data: [],
          })
          .select()
          .single();

        if (createError) throw createError;
        listId = newList.id;
      }

      if (!listId || listId === 'new') {
        toast({
          title: 'Selecione ou crie uma lista',
          variant: 'destructive',
        });
        return;
      }

      // Get current list data
      const { data: currentList, error: fetchError } = await supabase
        .from('broadcast_lists')
        .select('phones, lead_data')
        .eq('id', listId)
        .single();

      if (fetchError) throw fetchError;

      // Prepare new leads data
      const newLeads: LeadData[] = selectedBusinesses.map(b => ({
        name: b.name,
        phone: b.phone || b.whatsapp?.replace(/\D/g, '') || '',
        address: b.address,
        city: b.city,
        state: b.state,
        rating: b.rating,
        whatsapp: b.whatsapp,
        instagram: b.instagram,
        website: b.website,
      })).filter(lead => lead.phone);

      // Merge with existing data (avoid duplicates by phone)
      const existingPhones = new Set(currentList?.phones || []);
      const existingLeads = (currentList?.lead_data || []) as unknown as LeadData[];
      
      const uniqueNewLeads = newLeads.filter(lead => !existingPhones.has(lead.phone));
      const updatedPhones = [...(currentList?.phones || []), ...uniqueNewLeads.map(l => l.phone)];
      const updatedLeadData = [...existingLeads, ...uniqueNewLeads];

      // Update list - cast to any to avoid Json type issues
      const { error: updateError } = await supabase
        .from('broadcast_lists')
        .update({
          phones: updatedPhones,
          lead_data: updatedLeadData as any,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listId);

      if (updateError) throw updateError;

      toast({
        title: 'Leads adicionados!',
        description: `${uniqueNewLeads.length} contatos adicionados à lista.`,
      });

      setDialogOpen(false);
      setSelectedIds(new Set());
      setSelectedListId('');
      setNewListName('');
      loadBroadcastLists();
    } catch (error) {
      console.error('Error adding to list:', error);
      toast({
        title: 'Erro ao adicionar',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (results.length === 0) {
    return null;
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-4">
      {/* Selection Controls */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selectedIds.size === results.length && results.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm">
            {selectedCount > 0 
              ? `${selectedCount} selecionado${selectedCount !== 1 ? 's' : ''}`
              : 'Selecionar todos'
            }
          </span>
        </div>
        
        {selectedCount > 0 && (
          <Button 
            size="sm" 
            onClick={() => setDialogOpen(true)}
            className="gap-2"
          >
            <MessageCircle className="h-4 w-4" />
            Adicionar à lista de disparo
          </Button>
        )}
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((business, index) => (
          <Card 
            key={`${business.place_id}-${index}`} 
            className={`flex flex-col transition-all ${selectedIds.has(business.place_id) ? 'ring-2 ring-primary' : ''}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedIds.has(business.place_id)}
                  onCheckedChange={() => toggleSelect(business.place_id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">{business.name}</CardTitle>
                    {business.rating && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">{business.rating}</span>
                        {business.reviews && (
                          <span className="text-xs text-muted-foreground">({business.reviews})</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 flex-1">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{business.address}</span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {business.city}, {business.state}
                </Badge>
                
                {business.category && (
                  <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                    {business.category}
                  </Badge>
                )}
                
                {business.source && (
                  <Badge variant="outline" className="text-xs gap-1">
                    {business.source === 'google_maps' ? (
                      <><Map className="h-3 w-3" /> Maps</>
                    ) : (
                      <><Instagram className="h-3 w-3" /> IG</>
                    )}
                  </Badge>
                )}
                
                <QualityBadge business={business} />
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-2">
                {business.whatsapp && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700"
                    asChild
                  >
                    <a href={business.whatsapp} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                )}
                
                {business.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                    asChild
                  >
                    <a href={`mailto:${business.email}`}>
                      <Mail className="h-4 w-4" />
                      Email
                    </a>
                  </Button>
                )}
                
                {business.instagram && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-pink-600 border-pink-200 hover:bg-pink-50 hover:text-pink-700"
                    asChild
                  >
                    <a href={business.instagram} target="_blank" rel="noopener noreferrer">
                      <Instagram className="h-4 w-4" />
                      Instagram
                    </a>
                  </Button>
                )}
                
                {business.facebook && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    asChild
                  >
                    <a href={business.facebook} target="_blank" rel="noopener noreferrer">
                      <Facebook className="h-4 w-4" />
                      Facebook
                    </a>
                  </Button>
                )}
                
                {business.linkedin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-sky-600 border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                    asChild
                  >
                    <a href={business.linkedin} target="_blank" rel="noopener noreferrer">
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </a>
                  </Button>
                )}
                
                {business.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    asChild
                  >
                    <a href={`tel:${business.phone}`}>
                      <Phone className="h-4 w-4" />
                      Ligar
                    </a>
                  </Button>
                )}
                
                {business.website && 
                 business.website.trim() !== '' && 
                 business.website.startsWith('http') &&
                 !business.website.includes('wa.me') && 
                 !business.website.includes('instagram.com') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    asChild
                  >
                    <a href={business.website} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Site
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add to List Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar à Lista de Disparo</DialogTitle>
            <DialogDescription>
              {selectedCount} lead{selectedCount !== 1 ? 's' : ''} selecionado{selectedCount !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Selecione uma lista</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma lista..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">+ Criar nova lista</SelectItem>
                  {broadcastLists.map(list => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.phones.length} contatos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedListId === 'new' && (
              <div className="space-y-2">
                <Label>Nome da nova lista</Label>
                <Input
                  placeholder="Ex: Leads Janeiro 2024"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddToList} 
              disabled={isAdding || (!selectedListId || (selectedListId === 'new' && !newListName))}
            >
              {isAdding ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

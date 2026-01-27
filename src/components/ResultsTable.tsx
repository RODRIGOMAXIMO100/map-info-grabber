import { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Star, Phone, MapPin, MessageCircle, Instagram, Map, Mail, Facebook, Linkedin, Award, Smartphone, PhoneCall, List, Grid3X3, ArrowUpDown, Check, Copy, FileSpreadsheet, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Business } from '@/types/business';
import { calculateLeadScore, getScoreBadgeColor } from '@/lib/leadScoring';
import { validateBrazilianPhone, getPhoneTypeBadgeClass } from '@/lib/phoneValidation';
import { exportToCSV, exportToExcel, copyPhonesToClipboard, exportWhatsAppList } from '@/lib/exportCsv';
import type { BroadcastList, LeadData } from '@/types/whatsapp';

type SortField = 'score' | 'name' | 'city' | 'rating' | 'channels';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';

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

// Phone type badge
function PhoneTypeBadge({ phone }: { phone: string }) {
  const validation = validateBrazilianPhone(phone);
  
  if (!validation.isValid) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 text-xs ${getPhoneTypeBadgeClass(validation.isMobile)}`}>
            {validation.isMobile ? (
              <><Smartphone className="h-3 w-3" /> Cel</>
            ) : (
              <><PhoneCall className="h-3 w-3" /> Fixo</>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>{validation.displayFormat}</p>
          <p className="text-xs text-muted-foreground">DDD: {validation.ddd}</p>
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
  
  // New states for view mode and sorting
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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

  // Sort results
  const sortedResults = useMemo(() => {
    const sorted = [...results].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'score':
          comparison = (b.score || 0) - (a.score || 0);
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name, 'pt-BR');
          break;
        case 'city':
          comparison = `${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`, 'pt-BR');
          break;
        case 'rating':
          comparison = (b.rating || 0) - (a.rating || 0);
          break;
        case 'channels':
          const countChannels = (b: Business) => 
            [b.whatsapp, b.email, b.instagram, b.facebook, b.linkedin].filter(Boolean).length;
          comparison = countChannels(b) - countChannels(a);
          break;
      }
      
      return sortDirection === 'asc' ? -comparison : comparison;
    });
    
    return sorted;
  }, [results, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
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

  // Smart selection
  const selectByFilter = (filter: 'whatsapp' | 'email' | 'mobile' | 'highScore') => {
    const filtered = results.filter(r => {
      switch (filter) {
        case 'whatsapp': return !!r.whatsapp;
        case 'email': return !!r.email;
        case 'mobile': 
          const validation = validateBrazilianPhone(r.phone);
          return validation.isValid && validation.isMobile;
        case 'highScore': return (r.score || 0) >= 3;
      }
    });
    setSelectedIds(new Set(filtered.map(r => r.place_id)));
    toast({
      title: `${filtered.length} leads selecionados`,
      description: `Filtro: ${filter === 'whatsapp' ? 'Com WhatsApp' : filter === 'email' ? 'Com Email' : filter === 'mobile' ? 'Celulares' : 'Alta Qualidade'}`,
    });
  };

  const getSelectedBusinesses = () => {
    return results.filter(r => selectedIds.has(r.place_id));
  };

  // Export handlers
  const handleExportCSV = () => {
    const data = selectedIds.size > 0 ? getSelectedBusinesses() : results;
    exportToCSV(data, 'leads');
    toast({ title: `${data.length} leads exportados para CSV` });
  };

  const handleExportExcel = () => {
    const data = selectedIds.size > 0 ? getSelectedBusinesses() : results;
    exportToExcel(data, 'leads');
    toast({ title: `${data.length} leads exportados para Excel` });
  };

  const handleExportWhatsApp = () => {
    const data = selectedIds.size > 0 ? getSelectedBusinesses() : results;
    exportWhatsAppList(data, 'numeros');
    toast({ title: 'Lista de números para WhatsApp exportada' });
  };

  const handleCopyPhones = async () => {
    const data = selectedIds.size > 0 ? getSelectedBusinesses() : results;
    const { count, success } = await copyPhonesToClipboard(data);
    if (success) {
      toast({ title: `${count} números copiados para a área de transferência` });
    } else {
      toast({ title: 'Erro ao copiar', variant: 'destructive' });
    }
  };

  const handleAddToList = async () => {
    const selectedBusinesses = getSelectedBusinesses();
    if (selectedBusinesses.length === 0) return;

    setIsAdding(true);
    try {
      let listId = selectedListId;

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

      const { data: currentList, error: fetchError } = await supabase
        .from('broadcast_lists')
        .select('phones, lead_data')
        .eq('id', listId)
        .single();

      if (fetchError) throw fetchError;

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

      const existingPhones = new Set(currentList?.phones || []);
      const existingLeads = (currentList?.lead_data || []) as unknown as LeadData[];
      
      const uniqueNewLeads = newLeads.filter(lead => !existingPhones.has(lead.phone));
      const updatedPhones = [...(currentList?.phones || []), ...uniqueNewLeads.map(l => l.phone)];
      const updatedLeadData = [...existingLeads, ...uniqueNewLeads];

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
      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={selectedIds.size === results.length && results.length > 0}
            onCheckedChange={toggleSelectAll}
          />
          <span className="text-sm">
            {selectedCount > 0 
              ? `${selectedCount} de ${results.length}`
              : 'Selecionar todos'
            }
          </span>
          
          {/* Smart selection dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                <Check className="h-3 w-3" />
                Seleção rápida
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => selectByFilter('whatsapp')}>
                <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
                Com WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => selectByFilter('email')}>
                <Mail className="h-4 w-4 mr-2 text-orange-600" />
                Com Email
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => selectByFilter('mobile')}>
                <Smartphone className="h-4 w-4 mr-2 text-blue-600" />
                Apenas Celulares
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => selectByFilter('highScore')}>
                <Award className="h-4 w-4 mr-2 text-yellow-600" />
                Alta Qualidade (3+)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>
                Limpar seleção
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <ArrowUpDown className="h-3.5 w-3.5" />
                Ordenar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => toggleSort('score')}>
                Score {sortField === 'score' && (sortDirection === 'desc' ? '↓' : '↑')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('name')}>
                Nome A-Z {sortField === 'name' && (sortDirection === 'asc' ? '↓' : '↑')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('city')}>
                Cidade {sortField === 'city' && (sortDirection === 'asc' ? '↓' : '↑')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('rating')}>
                Avaliação {sortField === 'rating' && (sortDirection === 'desc' ? '↓' : '↑')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleSort('channels')}>
                Canais {sortField === 'channels' && (sortDirection === 'desc' ? '↓' : '↑')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileText className="h-4 w-4 mr-2" />
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                Excel (.xlsx)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportWhatsApp}>
                <MessageCircle className="h-4 w-4 mr-2 text-green-600" />
                Lista WhatsApp (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyPhones}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar números
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View mode toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 rounded-none"
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 rounded-none"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Add to list button */}
      {selectedCount > 0 && (
        <Button 
          onClick={() => setDialogOpen(true)}
          className="w-full sm:w-auto gap-2"
        >
          <MessageCircle className="h-4 w-4" />
          Adicionar {selectedCount} à lista de disparo
        </Button>
      )}

      {/* Results - Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedResults.map((business, index) => (
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
                  
                  {business.phone && <PhoneTypeBadge phone={business.phone} />}
                  
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
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results - List View */}
      {viewMode === 'list' && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selectedIds.size === results.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="min-w-[200px]">Nome</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Canais</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="w-20">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedResults.map((business, index) => {
                const phoneValidation = validateBrazilianPhone(business.phone);
                const { score, level } = calculateLeadScore(business);
                
                return (
                  <TableRow 
                    key={`${business.place_id}-${index}`}
                    className={selectedIds.has(business.place_id) ? 'bg-primary/5' : ''}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(business.place_id)}
                        onCheckedChange={() => toggleSelect(business.place_id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium line-clamp-1">{business.name}</div>
                      {business.category && (
                        <div className="text-xs text-muted-foreground">{business.category}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{business.city}, {business.state}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{phoneValidation.displayFormat}</span>
                        {phoneValidation.isValid && (
                          <span className={`text-xs ${phoneValidation.isMobile ? 'text-green-600' : 'text-gray-500'}`}>
                            {phoneValidation.isMobile ? '📱' : '☎️'}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {business.whatsapp && <MessageCircle className="h-4 w-4 text-green-600" />}
                        {business.email && <Mail className="h-4 w-4 text-orange-600" />}
                        {business.instagram && <Instagram className="h-4 w-4 text-pink-600" />}
                        {business.facebook && <Facebook className="h-4 w-4 text-blue-600" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className={`text-xs ${getScoreBadgeColor(level)}`}>
                        {score.toFixed(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {business.whatsapp && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                            <a href={business.whatsapp} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="h-4 w-4 text-green-600" />
                            </a>
                          </Button>
                        )}
                        {business.website && business.website.startsWith('http') && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" asChild>
                            <a href={business.website} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

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

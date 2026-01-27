import { useState, useEffect } from 'react';
import { Folder, Plus, Trash2, Edit2, Check, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Location } from '@/types/business';
import {
  RegionGroup,
  getRegionGroups,
  saveRegionGroup,
  updateRegionGroup,
  deleteRegionGroup,
} from '@/lib/regionGroups';

interface RegionGroupSelectorProps {
  currentLocations: Location[];
  onLoadGroup: (locations: Location[]) => void;
}

export function RegionGroupSelector({ currentLocations, onLoadGroup }: RegionGroupSelectorProps) {
  const [groups, setGroups] = useState<RegionGroup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const { toast } = useToast();

  // Load groups on mount
  useEffect(() => {
    setGroups(getRegionGroups());
  }, []);

  const handleCreateGroup = () => {
    console.log('[RegionGroupSelector] handleCreateGroup chamado');
    console.log('[RegionGroupSelector] currentLocations:', currentLocations);
    console.log('[RegionGroupSelector] newGroupName:', newGroupName);
    
    if (!newGroupName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para o grupo.',
        variant: 'destructive',
      });
      return;
    }

    if (currentLocations.length === 0) {
      toast({
        title: 'Nenhuma cidade selecionada',
        description: 'Adicione cidades antes de criar um grupo.',
        variant: 'destructive',
      });
      return;
    }

    const newGroup = saveRegionGroup(newGroupName, currentLocations);
    console.log('[RegionGroupSelector] Grupo criado:', newGroup);
    setGroups([...groups, newGroup]);
    setNewGroupName('');
    setIsCreating(false);

    toast({
      title: 'Grupo criado',
      description: `"${newGroup.name}" salvo com ${currentLocations.length} cidades.`,
    });
  };

  const handleLoadGroup = (group: RegionGroup) => {
    onLoadGroup(group.locations);
    toast({
      title: 'Grupo carregado',
      description: `${group.locations.length} cidades de "${group.name}" adicionadas.`,
    });
  };

  const handleDeleteGroup = (id: string, name: string) => {
    deleteRegionGroup(id);
    setGroups(groups.filter(g => g.id !== id));
    toast({
      title: 'Grupo excluído',
      description: `"${name}" foi removido.`,
    });
  };

  const handleStartEdit = (group: RegionGroup) => {
    setEditingId(group.id);
    setEditingName(group.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) return;

    const updated = updateRegionGroup(editingId, { name: editingName.trim() });
    if (updated) {
      setGroups(groups.map(g => g.id === editingId ? updated : g));
      toast({
        title: 'Grupo atualizado',
        description: `Nome alterado para "${updated.name}".`,
      });
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  // Group locations by state for display
  const groupLocationsByState = (locations: Location[]) => {
    const grouped: Record<string, string[]> = {};
    locations.forEach(loc => {
      if (!grouped[loc.state]) grouped[loc.state] = [];
      grouped[loc.state].push(loc.city);
    });
    return grouped;
  };

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Folder className="h-4 w-4" />
          Grupos Salvos
        </h4>
        {!isCreating && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Grupo
          </Button>
        )}
      </div>

      {/* Create new group form */}
      {isCreating && (
        <div className="space-y-2">
          {currentLocations.length === 0 && (
            <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md border border-amber-200 dark:border-amber-800">
              ⚠️ Adicione cidades nas abas "Uma cidade" ou "Várias cidades" primeiro
            </div>
          )}
          <div className="flex gap-2 p-3 bg-muted/50 rounded-md border">
          <Input
            placeholder="Nome do grupo (ex: Zona da Mata MG)"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleCreateGroup();
              }
            }}
            className="flex-1"
            autoFocus
          />
          <Button type="button" size="sm" onClick={handleCreateGroup}>
            <Check className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setIsCreating(false); setNewGroupName(''); }}>
            <X className="h-4 w-4" />
          </Button>
          </div>
        </div>
      )}

      {/* Saved groups list */}
      {groups.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhum grupo salvo ainda.</p>
          <p className="text-xs mt-1">
            Adicione cidades e clique em "Novo Grupo" para salvar.
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {groups.map((group) => {
              const groupedByState = groupLocationsByState(group.locations);
              const stateCount = Object.keys(groupedByState).length;

              return (
                <div
                  key={group.id}
                  className="p-3 rounded-md border bg-background hover:bg-muted/30 transition-colors"
                >
                  {editingId === group.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="flex-1 h-8"
                        autoFocus
                      />
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={handleSaveEdit}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={handleCancelEdit}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{group.name}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleStartEdit(group)}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir grupo?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O grupo "{group.name}" será removido permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteGroup(group.id, group.name)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(groupedByState).slice(0, 3).map(([state, cities]) => (
                          <Badge key={state} variant="secondary" className="text-xs">
                            {state}: {cities.length}
                          </Badge>
                        ))}
                        {stateCount > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{stateCount - 3} estados
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {group.locations.length} {group.locations.length === 1 ? 'cidade' : 'cidades'}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => handleLoadGroup(group)}
                        >
                          Usar
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* Save current selection hint */}
      {currentLocations.length > 0 && !isCreating && (
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          {currentLocations.length} {currentLocations.length === 1 ? 'cidade selecionada' : 'cidades selecionadas'} •{' '}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setIsCreating(true)}
          >
            Salvar como grupo
          </button>
        </div>
      )}
    </div>
  );
}

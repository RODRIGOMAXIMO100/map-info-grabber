import { useState, useMemo } from 'react';
import { Search, Plus, Edit2, Trash2, Zap, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { QuickReply, useQuickReplies, QuickReplyInput } from '@/hooks/useQuickReplies';
import { QuickReplyModal } from './QuickReplyModal';

interface QuickRepliesPanelProps {
  onSelectReply: (content: string) => void;
}

export function QuickRepliesPanel({ onSelectReply }: QuickRepliesPanelProps) {
  const { 
    quickReplies, 
    loading, 
    createQuickReply, 
    updateQuickReply, 
    deleteQuickReply,
    getCategories 
  } = useQuickReplies();
  
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [deleteReply, setDeleteReply] = useState<QuickReply | null>(null);
  const [isManaging, setIsManaging] = useState(false);

  const categories = useMemo(() => getCategories(), [getCategories]);

  const filteredReplies = useMemo(() => {
    if (!search.trim()) return quickReplies;
    const lowerSearch = search.toLowerCase();
    return quickReplies.filter(qr =>
      qr.title.toLowerCase().includes(lowerSearch) ||
      qr.content.toLowerCase().includes(lowerSearch) ||
      qr.shortcut?.toLowerCase().includes(lowerSearch) ||
      qr.category.toLowerCase().includes(lowerSearch)
    );
  }, [quickReplies, search]);

  const groupedReplies = useMemo(() => {
    const groups: Record<string, QuickReply[]> = {};
    filteredReplies.forEach(reply => {
      if (!groups[reply.category]) {
        groups[reply.category] = [];
      }
      groups[reply.category].push(reply);
    });
    return groups;
  }, [filteredReplies]);

  const handleSelect = (reply: QuickReply) => {
    onSelectReply(reply.content);
    setOpen(false);
    setSearch('');
  };

  const handleEdit = (reply: QuickReply) => {
    setEditingReply(reply);
    setModalOpen(true);
  };

  const handleSave = async (input: QuickReplyInput): Promise<boolean> => {
    if (editingReply) {
      return updateQuickReply(editingReply.id, input);
    }
    return createQuickReply(input);
  };

  const handleConfirmDelete = async () => {
    if (deleteReply) {
      await deleteQuickReply(deleteReply.id);
      setDeleteReply(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title="Respostas Rápidas"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>

        <PopoverContent 
          className="w-80 p-0" 
          align="end"
          side="top"
        >
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Respostas Rápidas</h4>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsManaging(!isManaging)}
                  title={isManaging ? 'Sair do modo edição' : 'Gerenciar respostas'}
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingReply(null);
                    setModalOpen(true);
                  }}
                  title="Nova resposta"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar ou digitar /atalho..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>

          <ScrollArea className="h-64">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Carregando...
              </div>
            ) : Object.keys(groupedReplies).length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {search ? 'Nenhuma resposta encontrada' : 'Nenhuma resposta criada ainda'}
              </div>
            ) : (
              <div className="p-2">
                {Object.entries(groupedReplies).map(([category, replies]) => (
                  <div key={category} className="mb-3">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      {category}
                    </div>
                    {replies.map((reply) => (
                      <div
                        key={reply.id}
                        className="group flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                        onClick={() => !isManaging && handleSelect(reply)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">
                              {reply.title}
                            </span>
                            {reply.shortcut && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                /{reply.shortcut}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {reply.content}
                          </p>
                        </div>
                        
                        {isManaging && (
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(reply);
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteReply(reply);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="p-2 border-t text-xs text-muted-foreground text-center">
            Digite <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">/atalho</kbd> no chat para inserir
          </div>
        </PopoverContent>
      </Popover>

      <QuickReplyModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditingReply(null);
        }}
        reply={editingReply}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteReply} onOpenChange={(open) => !open && setDeleteReply(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir resposta rápida?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta "{deleteReply?.title}" será excluída permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

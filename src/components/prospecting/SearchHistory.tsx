import { useState, useEffect, useCallback } from 'react';
import { Star, Clock, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Location } from '@/types/business';

const HISTORY_STORAGE_KEY = 'prospecting_search_history';
const MAX_HISTORY_ITEMS = 10;

export interface SavedSearch {
  id: string;
  keyword: string;
  locations: Location[];
  createdAt: string;
  resultCount: number;
  isFavorite: boolean;
}

interface SearchHistoryProps {
  onSelect: (search: SavedSearch) => void;
  className?: string;
}

export function SearchHistory({ onSelect, className }: SearchHistoryProps) {
  const [history, setHistory] = useState<SavedSearch[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Save history to localStorage
  const saveHistory = useCallback((newHistory: SavedSearch[]) => {
    setHistory(newHistory);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
  }, []);

  const toggleFavorite = (id: string) => {
    const updated = history.map(item =>
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    );
    // Sort: favorites first, then by date
    updated.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return b.isFavorite ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    saveHistory(updated);
  };

  const removeItem = (id: string) => {
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
  };

  const clearAll = () => {
    saveHistory([]);
  };

  if (history.length === 0) {
    return null;
  }

  const favorites = history.filter(h => h.isFavorite);
  const recent = history.filter(h => !h.isFavorite);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Buscas recentes ({history.length})
          </span>
          <RefreshCw className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2">
        <div className="border rounded-lg bg-muted/30 p-3">
          <ScrollArea className="max-h-[200px]">
            <div className="space-y-1.5">
              {/* Favorites first */}
              {favorites.map(item => (
                <SearchHistoryItem
                  key={item.id}
                  item={item}
                  onSelect={() => onSelect(item)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
              
              {/* Recent searches */}
              {recent.map(item => (
                <SearchHistoryItem
                  key={item.id}
                  item={item}
                  onSelect={() => onSelect(item)}
                  onToggleFavorite={() => toggleFavorite(item.id)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
          </ScrollArea>
          
          {history.length > 0 && (
            <div className="pt-2 mt-2 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-destructive w-full"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Limpar histórico
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Individual history item
interface SearchHistoryItemProps {
  item: SavedSearch;
  onSelect: () => void;
  onToggleFavorite: () => void;
  onRemove: () => void;
}

function SearchHistoryItem({ item, onSelect, onToggleFavorite, onRemove }: SearchHistoryItemProps) {
  const timeAgo = formatDistanceToNow(new Date(item.createdAt), {
    addSuffix: true,
    locale: ptBR,
  });

  const locationSummary = item.locations.length === 1
    ? `${item.locations[0].city}, ${item.locations[0].state}`
    : `${item.locations.length} cidades`;

  return (
    <div className="flex items-center gap-2 p-2 rounded-md hover:bg-background/80 group transition-colors">
      <button
        onClick={onToggleFavorite}
        className="shrink-0"
      >
        <Star
          className={`h-4 w-4 transition-colors ${
            item.isFavorite 
              ? 'fill-yellow-400 text-yellow-400' 
              : 'text-muted-foreground/50 hover:text-yellow-400'
          }`}
        />
      </button>
      
      <button
        onClick={onSelect}
        className="flex-1 text-left min-w-0"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.keyword}</span>
          <Badge variant="secondary" className="text-xs shrink-0">
            {item.resultCount} leads
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span>{locationSummary}</span>
          <span>•</span>
          <span>{timeAgo}</span>
        </div>
      </button>
      
      <button
        onClick={onRemove}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

// Helper to add a search to history
export function addSearchToHistory(
  keyword: string,
  locations: Location[],
  resultCount: number
): void {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    let history: SavedSearch[] = saved ? JSON.parse(saved) : [];

    // Check if same search exists (same keyword and same locations)
    const existingIndex = history.findIndex(h => 
      h.keyword.toLowerCase() === keyword.toLowerCase() &&
      h.locations.length === locations.length &&
      h.locations.every(loc => 
        locations.some(l => l.city === loc.city && l.state === loc.state)
      )
    );

    const newSearch: SavedSearch = {
      id: existingIndex >= 0 ? history[existingIndex].id : crypto.randomUUID(),
      keyword,
      locations,
      createdAt: new Date().toISOString(),
      resultCount,
      isFavorite: existingIndex >= 0 ? history[existingIndex].isFavorite : false,
    };

    // Remove existing if found
    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }

    // Add to front
    history.unshift(newSearch);

    // Keep only MAX items (but keep all favorites)
    const favorites = history.filter(h => h.isFavorite);
    const recent = history.filter(h => !h.isFavorite).slice(0, MAX_HISTORY_ITEMS - favorites.length);
    history = [...favorites, ...recent];

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // Ignore errors
  }
}

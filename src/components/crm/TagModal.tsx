import { useState } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadName: string;
  currentTags: string[];
  onSave: (tags: string[]) => void;
}

const SUGGESTED_TAGS = [
  'VIP',
  'Empresa Grande',
  'Indicação',
  'Difícil',
  'Urgente',
  'Follow-up',
  'Interessado',
  'Decisor',
];

export function TagModal({ open, onOpenChange, leadName, currentTags, onSave }: TagModalProps) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [newTag, setNewTag] = useState('');

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = () => {
    onSave(tags);
    onOpenChange(false);
  };

  const availableSuggestions = SUGGESTED_TAGS.filter((t) => !tags.includes(t));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Tags do Lead
          </DialogTitle>
          <DialogDescription>
            Adicione tags para organizar <strong>{leadName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Tags */}
          {tags.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Tags atuais:</p>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:bg-destructive/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Add new tag */}
          <div className="flex gap-2">
            <Input
              placeholder="Nova tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag(newTag);
                }
              }}
              className="flex-1"
            />
            <Button 
              size="icon" 
              variant="outline"
              onClick={() => handleAddTag(newTag)}
              disabled={!newTag.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Suggested Tags */}
          {availableSuggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Sugestões:</p>
              <div className="flex flex-wrap gap-2">
                {availableSuggestions.map((tag) => (
                  <Button
                    key={tag}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleAddTag(tag)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {tag}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave}>
              Salvar Tags
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
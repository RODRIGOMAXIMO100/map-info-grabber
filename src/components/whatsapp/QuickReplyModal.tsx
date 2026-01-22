import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { QuickReply, QuickReplyInput } from '@/hooks/useQuickReplies';

interface QuickReplyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reply?: QuickReply | null;
  onSave: (input: QuickReplyInput) => Promise<boolean>;
}

export function QuickReplyModal({
  open,
  onOpenChange,
  reply,
  onSave,
}: QuickReplyModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('geral');
  const [shortcut, setShortcut] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (reply) {
      setTitle(reply.title);
      setContent(reply.content);
      setCategory(reply.category);
      setShortcut(reply.shortcut || '');
    } else {
      setTitle('');
      setContent('');
      setCategory('geral');
      setShortcut('');
    }
  }, [reply, open]);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    const success = await onSave({
      title: title.trim(),
      content: content.trim(),
      category: category.trim() || 'geral',
      shortcut: shortcut.trim() || undefined,
    });
    setSaving(false);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reply ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Saudação inicial"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Conteúdo *</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Digite o texto da resposta..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="geral"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shortcut">
                Atalho <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="shortcut"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value.replace(/\s/g, ''))}
                placeholder="saudacao"
              />
              <p className="text-xs text-muted-foreground">
                Digite /{shortcut || 'atalho'} no chat
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!title.trim() || !content.trim() || saving}
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

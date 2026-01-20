import { useState, useEffect, useCallback, useRef } from 'react';
import { StickyNote, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ConversationNotesProps {
  conversationId: string;
  initialNotes: string | null;
  onNotesChange?: (notes: string) => void;
  variant?: 'popover' | 'inline';
}

export function ConversationNotes({ 
  conversationId, 
  initialNotes,
  onNotesChange,
  variant = 'popover'
}: ConversationNotesProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef(initialNotes || '');

  // Update notes when conversation changes
  useEffect(() => {
    setNotes(initialNotes || '');
    lastSavedRef.current = initialNotes || '';
    setIsSaved(false);
  }, [conversationId, initialNotes]);

  // Auto-save with debounce
  const saveNotes = useCallback(async (value: string) => {
    if (value === lastSavedRef.current) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('whatsapp_conversations')
        .update({ notes: value || null })
        .eq('id', conversationId);

      if (!error) {
        lastSavedRef.current = value;
        setIsSaved(true);
        onNotesChange?.(value);
        
        // Hide "saved" indicator after 3 seconds
        setTimeout(() => setIsSaved(false), 3000);
      } else {
        console.error('Error saving notes:', error);
      }
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setIsSaving(false);
    }
  }, [conversationId, onNotesChange]);

  // Debounced save on change
  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    setIsSaved(false);
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveNotes(value);
    }, 1000);
  }, [saveNotes]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const hasNotes = notes.trim().length > 0;

  // Variante inline - sempre visível
  if (variant === 'inline') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground h-4">
          {isSaving && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Salvando...</span>
            </>
          )}
          {isSaved && !isSaving && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Salvo</span>
            </>
          )}
        </div>
        
        <Textarea
          placeholder="Adicione observações sobre este lead..."
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          className="min-h-[80px] resize-none text-sm"
        />
        
        <p className="text-[10px] text-muted-foreground">
          As notas são salvas automaticamente
        </p>
      </div>
    );
  }

  // Variante popover (padrão) - com toggle button
  return (
    <div className="relative">
      {/* Notes Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-7 w-7 relative",
          isOpen && "bg-accent"
        )}
        onClick={() => setIsOpen(!isOpen)}
        title={hasNotes ? "Ver/editar notas" : "Adicionar notas"}
      >
        <StickyNote className="h-3.5 w-3.5" />
        {hasNotes && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full" />
        )}
      </Button>

      {/* Notes Panel - Collapsible */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 w-80 bg-popover border rounded-lg shadow-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              Notas da Conversa
            </h4>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {isSaving && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Salvando...</span>
                </>
              )}
              {isSaved && !isSaving && (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-green-500">Salvo</span>
                </>
              )}
            </div>
          </div>
          
          <Textarea
            placeholder="Adicione observações sobre este lead..."
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            className="min-h-[100px] resize-none text-sm"
          />
          
          <p className="text-[10px] text-muted-foreground">
            As notas são salvas automaticamente
          </p>
        </div>
      )}
    </div>
  );
}

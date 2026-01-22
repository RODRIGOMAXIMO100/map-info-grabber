import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface QuickReply {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyInput {
  title: string;
  content: string;
  category?: string;
  shortcut?: string;
}

export function useQuickReplies() {
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();

  const loadQuickReplies = useCallback(async () => {
    if (!user) {
      setQuickReplies([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('quick_replies' as any)
        .select('*')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('title', { ascending: true });

      if (error) throw error;
      setQuickReplies((data || []) as unknown as QuickReply[]);
    } catch (error) {
      console.error('Error loading quick replies:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadQuickReplies();
  }, [loadQuickReplies]);

  const createQuickReply = async (input: QuickReplyInput): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('quick_replies' as any)
        .insert({
          user_id: user.id,
          title: input.title,
          content: input.content,
          category: input.category || 'geral',
          shortcut: input.shortcut || null,
        });

      if (error) throw error;

      toast({
        title: 'Resposta rápida criada',
        description: `"${input.title}" foi adicionada às suas respostas.`,
      });

      await loadQuickReplies();
      return true;
    } catch (error: any) {
      console.error('Error creating quick reply:', error);
      toast({
        title: 'Erro ao criar resposta',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const updateQuickReply = async (id: string, input: Partial<QuickReplyInput>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('quick_replies' as any)
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Resposta atualizada',
        description: 'Alterações salvas com sucesso.',
      });

      await loadQuickReplies();
      return true;
    } catch (error: any) {
      console.error('Error updating quick reply:', error);
      toast({
        title: 'Erro ao atualizar',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const deleteQuickReply = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('quick_replies' as any)
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Resposta removida',
        description: 'A resposta rápida foi excluída.',
      });

      await loadQuickReplies();
      return true;
    } catch (error: any) {
      console.error('Error deleting quick reply:', error);
      toast({
        title: 'Erro ao excluir',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const findByShortcut = useCallback((shortcut: string): QuickReply | undefined => {
    return quickReplies.find(qr => 
      qr.shortcut?.toLowerCase() === shortcut.toLowerCase()
    );
  }, [quickReplies]);

  const filterByQuery = useCallback((query: string): QuickReply[] => {
    const lowerQuery = query.toLowerCase();
    return quickReplies.filter(qr => 
      qr.title.toLowerCase().includes(lowerQuery) ||
      qr.shortcut?.toLowerCase().includes(lowerQuery) ||
      qr.category.toLowerCase().includes(lowerQuery)
    );
  }, [quickReplies]);

  const getCategories = useCallback((): string[] => {
    const categories = new Set(quickReplies.map(qr => qr.category));
    return Array.from(categories).sort();
  }, [quickReplies]);

  return {
    quickReplies,
    loading,
    createQuickReply,
    updateQuickReply,
    deleteQuickReply,
    findByShortcut,
    filterByQuery,
    getCategories,
    refresh: loadQuickReplies,
  };
}

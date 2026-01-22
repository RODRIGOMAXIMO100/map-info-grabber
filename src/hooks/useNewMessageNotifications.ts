import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatMessagePreview } from '@/components/whatsapp/MessageContent';

// Play custom cash register sound
const playMoneySound = () => {
  try {
    const audio = new Audio('/sounds/cash-register.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.warn('Could not play sound:', err));
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

export function useNewMessageNotifications() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const notifiedIds = useRef<Set<string>>(new Set());
  const conversationCache = useRef<Map<string, { name: string | null; phone: string; muted_until: string | null; assigned_to: string | null; is_group: boolean | null }>>(new Map());

  // Fetch conversation info when needed
  const getConversationInfo = useCallback(async (conversationId: string) => {
    if (conversationCache.current.has(conversationId)) {
      return conversationCache.current.get(conversationId)!;
    }

    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('name, phone, muted_until, assigned_to, is_group')
      .eq('id', conversationId)
      .single();

    if (data) {
      conversationCache.current.set(conversationId, data);
      return data;
    }

    return { name: null, phone: 'Desconhecido', muted_until: null, assigned_to: null, is_group: null };
  }, []);

  // Handle incoming message notification
  const handleNewMessage = useCallback(async (payload: any) => {
    const message = payload.new;
    
    // Only notify for incoming messages
    if (message.direction !== 'incoming') return;
    
    // Avoid duplicate notifications
    if (notifiedIds.current.has(message.id)) return;
    notifiedIds.current.add(message.id);
    
    // Limit cache size
    if (notifiedIds.current.size > 100) {
      const entries = Array.from(notifiedIds.current);
      entries.slice(0, 50).forEach(id => notifiedIds.current.delete(id));
    }

    // Get conversation info
    const convInfo = await getConversationInfo(message.conversation_id);
    
    // Skip notifications for groups
    if (convInfo.is_group || convInfo.phone?.includes('@g.us')) {
      return;
    }
    
    // Check if user has permission to see this conversation
    if (!isAdmin && user) {
      // Closers/SDRs only see conversations assigned to them or unassigned
      if (convInfo.assigned_to !== null && convInfo.assigned_to !== user.id) {
        return; // Don't notify - conversation assigned to another user
      }
    }
    
    // Check if conversation is muted
    if (convInfo.muted_until) {
      const mutedUntil = new Date(convInfo.muted_until);
      if (mutedUntil > new Date()) {
        return; // Don't notify for muted conversations
      }
    }

    const leadName = convInfo.name || convInfo.phone;
    const formattedPreview = formatMessagePreview(message.content, message.message_type);
    const messagePreview = formattedPreview 
      ? (formattedPreview.length > 50 ? formattedPreview.slice(0, 50) + '...' : formattedPreview)
      : '📨 Nova mensagem';

    // Play cash register sound
    playMoneySound();

    // Show toast notification
    toast.success(`💰 Nova mensagem de ${leadName}`, {
      description: messagePreview,
      duration: 8000,
      action: {
        label: 'Ver Chat',
        onClick: () => navigate(`/whatsapp/chat?lead=${message.conversation_id}`)
      }
    });
  }, [navigate, getConversationInfo, user, isAdmin]);

  useEffect(() => {
    // Subscribe to new messages via realtime
    const channel = supabase
      .channel('new-message-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
        },
        handleNewMessage
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleNewMessage]);
}

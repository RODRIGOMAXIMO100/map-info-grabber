import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

// Generate cash register "ca-ching" sound using Web Audio API
const playMoneySound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);

    // First "ca" note
    const osc1 = audioContext.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(800, audioContext.currentTime);
    osc1.connect(gainNode);
    osc1.start(audioContext.currentTime);
    osc1.stop(audioContext.currentTime + 0.1);

    // Second "ching" note (higher pitch)
    const osc2 = audioContext.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1200, audioContext.currentTime + 0.12);
    osc2.connect(gainNode);
    osc2.start(audioContext.currentTime + 0.12);
    osc2.stop(audioContext.currentTime + 0.3);

    // Third harmonic for richer sound
    const osc3 = audioContext.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.setValueAtTime(1600, audioContext.currentTime + 0.12);
    const gain3 = audioContext.createGain();
    gain3.gain.setValueAtTime(0.15, audioContext.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
    osc3.connect(gain3);
    gain3.connect(audioContext.destination);
    osc3.start(audioContext.currentTime + 0.12);
    osc3.stop(audioContext.currentTime + 0.35);
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

export function useNewMessageNotifications() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const notifiedIds = useRef<Set<string>>(new Set());
  const conversationCache = useRef<Map<string, { name: string | null; phone: string; muted_until: string | null; assigned_to: string | null }>>(new Map());

  // Fetch conversation info when needed
  const getConversationInfo = useCallback(async (conversationId: string) => {
    if (conversationCache.current.has(conversationId)) {
      return conversationCache.current.get(conversationId)!;
    }

    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('name, phone, muted_until, assigned_to')
      .eq('id', conversationId)
      .single();

    if (data) {
      conversationCache.current.set(conversationId, data);
      return data;
    }

    return { name: null, phone: 'Desconhecido', muted_until: null, assigned_to: null };
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
    const messagePreview = message.content 
      ? (message.content.length > 50 ? message.content.slice(0, 50) + '...' : message.content)
      : (message.message_type === 'audio' ? '🎵 Áudio' : 
         message.message_type === 'image' ? '📷 Imagem' :
         message.message_type === 'video' ? '🎥 Vídeo' :
         message.message_type === 'document' ? '📄 Documento' : '📨 Nova mensagem');

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

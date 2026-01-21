import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { formatMessagePreview } from '@/components/whatsapp/MessageContent';

// Generate realistic cash register "ca-ching" sound using Web Audio API
const playMoneySound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Layer 1: Metallic coin/bell sound
    const bell = audioContext.createOscillator();
    const bellGain = audioContext.createGain();
    bell.type = 'sine';
    bell.frequency.setValueAtTime(2500, audioContext.currentTime);
    bell.frequency.exponentialRampToValueAtTime(1800, audioContext.currentTime + 0.15);
    bellGain.gain.setValueAtTime(0.3, audioContext.currentTime);
    bellGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    bell.connect(bellGain);
    bellGain.connect(audioContext.destination);
    bell.start(audioContext.currentTime);
    bell.stop(audioContext.currentTime + 0.5);
    
    // Layer 2: Lower harmonic (drawer opening)
    const drawer = audioContext.createOscillator();
    const drawerGain = audioContext.createGain();
    drawer.type = 'triangle';
    drawer.frequency.setValueAtTime(300, audioContext.currentTime + 0.05);
    drawer.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.2);
    drawerGain.gain.setValueAtTime(0.2, audioContext.currentTime + 0.05);
    drawerGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.25);
    drawer.connect(drawerGain);
    drawerGain.connect(audioContext.destination);
    drawer.start(audioContext.currentTime + 0.05);
    drawer.stop(audioContext.currentTime + 0.25);
    
    // Layer 3: Bright "ching" finale
    const ching = audioContext.createOscillator();
    const chingGain = audioContext.createGain();
    ching.type = 'sine';
    ching.frequency.setValueAtTime(3200, audioContext.currentTime + 0.1);
    chingGain.gain.setValueAtTime(0.25, audioContext.currentTime + 0.1);
    chingGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.6);
    ching.connect(chingGain);
    chingGain.connect(audioContext.destination);
    ching.start(audioContext.currentTime + 0.1);
    ching.stop(audioContext.currentTime + 0.6);
    
    // Layer 4: Short white noise burst (mechanical impact)
    const bufferSize = Math.floor(audioContext.sampleRate * 0.05);
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = audioContext.createBufferSource();
    const noiseGain = audioContext.createGain();
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 3000;
    noise.buffer = noiseBuffer;
    noiseGain.gain.setValueAtTime(0.1, audioContext.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    noise.start(audioContext.currentTime);
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

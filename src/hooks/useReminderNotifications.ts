import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { WhatsAppConversation } from '@/types/whatsapp';

// Simple notification sound using Web Audio API
const playNotificationSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Audio notification not available');
  }
};

interface UseReminderNotificationsOptions {
  conversations: WhatsAppConversation[];
  userId?: string;
  isAdmin?: boolean;
  onReminderTriggered?: (conv: WhatsAppConversation) => void;
  checkIntervalMs?: number;
}

export function useReminderNotifications({
  conversations,
  userId,
  isAdmin,
  onReminderTriggered,
  checkIntervalMs = 60000, // Check every minute
}: UseReminderNotificationsOptions) {
  const notifiedIds = useRef<Set<string>>(new Set());
  const lastCheckRef = useRef<number>(Date.now());

  const formatPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return phone;
  };

  const checkReminders = useCallback(() => {
    const now = Date.now();
    const lastCheck = lastCheckRef.current;
    lastCheckRef.current = now;

    conversations.forEach((conv) => {
      if (!conv.reminder_at) return;
      if (notifiedIds.current.has(conv.id)) return;
      
      // Non-admins only get notifications for reminders they created
      if (!isAdmin && userId && conv.reminder_created_by !== userId) return;

      const reminderTime = new Date(conv.reminder_at).getTime();
      
      // Check if reminder just passed (within the last check interval + 1 minute buffer)
      if (reminderTime <= now && reminderTime > lastCheck - 60000) {
        notifiedIds.current.add(conv.id);
        
        // Play sound
        playNotificationSound();
        
        // Show toast
        toast.warning(`🔔 Lembrete: ${conv.name || formatPhone(conv.phone)}`, {
          description: 'Hora de entrar em contato!',
          duration: 10000,
          action: {
            label: 'Ver',
            onClick: () => onReminderTriggered?.(conv),
          },
        });
      }
    });
  }, [conversations, onReminderTriggered]);

  // Check reminders on mount and interval
  useEffect(() => {
    // Initial check
    checkReminders();

    // Set up interval
    const intervalId = setInterval(checkReminders, checkIntervalMs);

    return () => clearInterval(intervalId);
  }, [checkReminders, checkIntervalMs]);

  // Reset notified IDs when a conversation's reminder is updated
  useEffect(() => {
    const currentIds = new Set(conversations.map(c => c.id));
    
    // Remove IDs that are no longer in conversations or no longer have reminders
    notifiedIds.current.forEach(id => {
      const conv = conversations.find(c => c.id === id);
      if (!conv || !conv.reminder_at) {
        notifiedIds.current.delete(id);
      }
    });
  }, [conversations]);
}

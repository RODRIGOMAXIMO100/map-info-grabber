import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type TableName = 
  | 'whatsapp_conversations'
  | 'whatsapp_messages'
  | 'whatsapp_queue'
  | 'whatsapp_logs'
  | 'broadcast_lists'
  | 'funnel_stage_history'
  | 'profiles'
  | 'user_roles';

type EventType = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface Subscription {
  table: TableName;
  event?: EventType;
  filter?: string;
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
}

// Global channel singleton
let globalChannel: RealtimeChannel | null = null;
let subscriptionCount = 0;
const subscriptions = new Map<string, Set<(payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void>>();

function getSubscriptionKey(table: TableName, event: EventType = '*', filter?: string): string {
  return `${table}:${event}:${filter || 'all'}`;
}

function initializeChannel() {
  if (globalChannel) return globalChannel;

  globalChannel = supabase.channel('app-realtime-global', {
    config: { broadcast: { self: true } }
  });

  // Add listeners for all tables we care about
  const tables: TableName[] = [
    'whatsapp_conversations',
    'whatsapp_messages',
    'whatsapp_queue',
    'whatsapp_logs',
    'broadcast_lists',
    'funnel_stage_history',
    'profiles',
    'user_roles'
  ];

  tables.forEach(table => {
    globalChannel!.on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload) => {
        // Notify all matching subscriptions
        subscriptions.forEach((callbacks, key) => {
          const [keyTable, keyEvent] = key.split(':');
          if (keyTable === table) {
            if (keyEvent === '*' || keyEvent === payload.eventType) {
              callbacks.forEach(cb => cb(payload));
            }
          }
        });
      }
    );
  });

  globalChannel.subscribe();
  return globalChannel;
}

function addSubscription(
  key: string, 
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
) {
  if (!subscriptions.has(key)) {
    subscriptions.set(key, new Set());
  }
  subscriptions.get(key)!.add(callback);
  subscriptionCount++;

  // Initialize channel on first subscription
  if (subscriptionCount === 1) {
    initializeChannel();
  }
}

function removeSubscription(
  key: string,
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
) {
  const callbacks = subscriptions.get(key);
  if (callbacks) {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      subscriptions.delete(key);
    }
  }
  subscriptionCount--;

  // Clean up channel when no more subscriptions
  if (subscriptionCount <= 0 && globalChannel) {
    supabase.removeChannel(globalChannel);
    globalChannel = null;
    subscriptionCount = 0;
  }
}

/**
 * Hook for subscribing to realtime database changes using a centralized channel.
 * This reduces websocket connections by sharing a single channel across all components.
 * 
 * @param table - The table to listen to
 * @param callback - Function called when changes occur
 * @param options - Optional event type and filter
 */
export function useRealtimeSubscription(
  table: TableName,
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  options?: { event?: EventType; filter?: string; enabled?: boolean }
) {
  const { event = '*', filter, enabled = true } = options || {};
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const stableCallback = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      callbackRef.current(payload);
    },
    []
  );

  useEffect(() => {
    if (!enabled) return;

    const key = getSubscriptionKey(table, event, filter);
    addSubscription(key, stableCallback);

    return () => {
      removeSubscription(key, stableCallback);
    };
  }, [table, event, filter, enabled, stableCallback]);
}

/**
 * Hook for subscribing to multiple tables at once.
 * Useful for components that need to react to changes in multiple tables.
 */
export function useMultiRealtimeSubscription(
  subscriptionConfigs: Subscription[],
  enabled: boolean = true
) {
  const callbackRefs = useRef(subscriptionConfigs.map(s => s.callback));
  
  useEffect(() => {
    callbackRefs.current = subscriptionConfigs.map(s => s.callback);
  }, [subscriptionConfigs]);

  useEffect(() => {
    if (!enabled) return;

    const cleanups: (() => void)[] = [];

    subscriptionConfigs.forEach((config, index) => {
      const key = getSubscriptionKey(config.table, config.event, config.filter);
      const callback = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        callbackRefs.current[index]?.(payload);
      };
      
      addSubscription(key, callback);
      cleanups.push(() => removeSubscription(key, callback));
    });

    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [subscriptionConfigs.length, enabled]);
}

/**
 * Simple hook that just triggers a reload function on any table change.
 * Most common use case - just reload data when something changes.
 */
export function useRealtimeRefresh(
  table: TableName,
  onRefresh: () => void,
  options?: { event?: EventType; enabled?: boolean }
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useRealtimeSubscription(
    table,
    useCallback(() => {
      onRefreshRef.current();
    }, []),
    options
  );
}

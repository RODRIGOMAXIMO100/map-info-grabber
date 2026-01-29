
# Plano: Corrigir Falha (Flicker) no Chat da Grazi

## Problema Identificado

O chat esta apresentando "flicker" (falhas visuais) que parecem estar relacionados a cache desatualizado. A analise do codigo revelou dois problemas principais:

### Causa Raiz 1: Cache de Notificacoes Nunca Invalida

Em `src/hooks/useNewMessageNotifications.ts`, o `conversationCache` armazena informacoes sobre conversas (nome, telefone, assigned_to, etc.) mas **nunca e limpo ou atualizado** quando uma conversa muda:

```typescript
// Linha 23 - Cache que NUNCA e invalidado
const conversationCache = useRef<Map<string, { 
  name: string | null; 
  phone: string; 
  muted_until: string | null; 
  assigned_to: string | null;  // ← Fica desatualizado!
  is_group: boolean | null 
}>>(new Map());
```

**Consequencia**: Quando uma conversa e atribuida a Grazi (assigned_to muda), o cache antigo pode fazer o sistema pensar que a conversa ainda nao esta atribuida ou esta atribuida a outro usuario, causando comportamento inconsistente nas notificacoes.

### Causa Raiz 2: Realtime Recarrega Toda a Lista

Em `src/pages/WhatsAppChat.tsx`, linhas 170-176:

```typescript
useRealtimeSubscription(
  'whatsapp_conversations',
  useCallback(() => {
    loadConversations();  // ← Recarrega TODAS as conversas a cada mudanca
  }, []),
);
```

**Consequencia**: Qualquer update em qualquer conversa dispara um reload completo da lista, causando:
- Flicker visual enquanto os dados sao substituidos
- A conversa selecionada pode "piscar" ou perder estado visual temporariamente

## Solucao Proposta

### Modificacao 1: Invalidar Cache de Notificacoes

Arquivo: `src/hooks/useNewMessageNotifications.ts`

Adicionar uma subscricao realtime para limpar o cache quando conversas sao atualizadas:

```typescript
// Limpar cache quando conversas sao atualizadas
useRealtimeSubscription(
  'whatsapp_conversations',
  useCallback((payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
      const record = payload.old || payload.new;
      if (record?.id) {
        conversationCache.current.delete(record.id as string);
      }
    }
  }, []),
  { event: '*' }
);
```

### Modificacao 2: Atualizar Conversa de Forma Incremental

Arquivo: `src/pages/WhatsAppChat.tsx`

Em vez de recarregar toda a lista, atualizar apenas a conversa que mudou:

```typescript
useRealtimeSubscription(
  'whatsapp_conversations',
  useCallback((payload) => {
    if (payload.eventType === 'UPDATE') {
      const updated = payload.new as ConversationWithInstance;
      setConversations(prev => prev.map(conv => 
        conv.id === updated.id ? { ...conv, ...updated } : conv
      ));
      // Atualizar conversa selecionada se for a mesma
      if (selectedConversation?.id === updated.id) {
        setSelectedConversation(prev => prev ? { ...prev, ...updated } : null);
      }
    } else if (payload.eventType === 'INSERT') {
      // Nova conversa - adicionar ao inicio
      const newConv = payload.new as ConversationWithInstance;
      if (!isAdmin && user?.id) {
        // Verificar permissao
        if (newConv.assigned_to !== null && newConv.assigned_to !== user.id) {
          return;
        }
      }
      setConversations(prev => [newConv, ...prev]);
    } else if (payload.eventType === 'DELETE') {
      const deleted = payload.old as { id: string };
      setConversations(prev => prev.filter(c => c.id !== deleted.id));
    }
  }, [selectedConversation?.id, isAdmin, user?.id]),
);
```

### Modificacao 3: Limitar Tamanho do Cache de IDs Notificados

Arquivo: `src/hooks/useNewMessageNotifications.ts`

Melhorar a limpeza do cache de IDs ja notificados:

```typescript
// Limite atual de 100 e baixo para sistemas ativos
// Aumentar para 500 e limpar 250 de cada vez
if (notifiedIds.current.size > 500) {
  const entries = Array.from(notifiedIds.current);
  entries.slice(0, 250).forEach(id => notifiedIds.current.delete(id));
}
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/hooks/useNewMessageNotifications.ts` | Adicionar invalidacao de cache via realtime |
| `src/pages/WhatsAppChat.tsx` | Substituir reload completo por update incremental |

## Resultado Esperado

1. **Sem flicker**: A lista de conversas atualiza de forma suave, apenas modificando a conversa afetada
2. **Cache sincronizado**: Notificacoes usam dados atualizados sobre assigned_to
3. **Melhor performance**: Menos requisicoes ao banco de dados

## Beneficio para Grazi

Apos a correcao, quando conversas forem atribuidas a ela:
- O cache sera limpo e buscara os dados atualizados
- A lista de chats nao vai "piscar" durante atualizacoes
- As notificacoes funcionarao corretamente com os dados de atribuicao atualizados

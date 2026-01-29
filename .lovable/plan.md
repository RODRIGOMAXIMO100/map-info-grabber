
# Plano: Corrigir Atribuicao Automatica de Leads do Broadcast

## Problema Identificado

Quando um lead responde a um disparo (broadcast), o sistema NAO esta atribuindo a conversa ao usuario responsavel configurado na lista de broadcast.

### Diagnostico

Analisando o codigo do webhook `whatsapp-receive-webhook/index.ts`:

1. Na linha 678, o sistema busca dados do broadcast:
```typescript
.select('broadcast_list_id, processed_at, phone')
```

2. Na linha 736-759, ao criar a conversa, o sistema inclui `broadcast_list_id` mas NAO inclui `assigned_to`

**O `assigned_to` da lista de broadcast simplesmente nao e transferido para a conversa.**

## Dados Confirmados

| Lista de Broadcast | Responsavel Configurado | Status |
|-------------------|------------------------|--------|
| reprodução humana JF | **Grazi bailon** | assigned_to correto na lista |

O problema esta que quando leads respondem, a conversa e criada SEM o `assigned_to`, fazendo com que caia no chat geral (visivel para admins e quem tem acesso).

## Solucao

### Modificar Edge Function: `whatsapp-receive-webhook/index.ts`

**Mudanca 1:** Alterar a query que busca dados do broadcast para incluir `assigned_to`:

```typescript
// Linha ~678 - Adicionar join com broadcast_lists para pegar assigned_to
const { data: queueItems } = await supabase
  .from('whatsapp_queue')
  .select('broadcast_list_id, processed_at, phone, broadcast_lists!inner(assigned_to)')
  .in('status', ['sent', 'delivered'])
  .order('processed_at', { ascending: false })
  .limit(500);
```

**Mudanca 2:** Extrair e armazenar o `assigned_to`:

```typescript
let broadcastAssignedTo: string | null = null;

if (matchedQueue) {
  broadcastListId = matchedQueue.broadcast_list_id;
  broadcastSentAt = matchedQueue.processed_at;
  broadcastAssignedTo = matchedQueue.broadcast_lists?.assigned_to || null;
  console.log(`[Broadcast] Found queue data: list_id=${broadcastListId}, assigned_to=${broadcastAssignedTo}`);
}
```

**Mudanca 3:** Incluir `assigned_to` no upsert da conversa:

```typescript
const { data: newConv, error: createError } = await supabase
  .from('whatsapp_conversations')
  .upsert({
    // ... campos existentes ...
    assigned_to: broadcastAssignedTo,        // NOVO
    assigned_at: broadcastAssignedTo ? new Date().toISOString() : null,  // NOVO
  }, { ... })
```

## Resultado Esperado

1. Quando um lead responde a um broadcast, a conversa sera automaticamente atribuida ao usuario responsavel da lista
2. O usuario responsavel vera a conversa na sua aba "Minhas Conversas"
3. As notificacoes de nova mensagem irao para o responsavel correto (nao para outros usuarios)

## Arquivos a Modificar

1. `supabase/functions/whatsapp-receive-webhook/index.ts` - Edge function principal

## Observacao Importante

Esta correcao afetara apenas NOVAS conversas criadas a partir de disparos. Para corrigir conversas JA CRIADAS sem atribuicao, sera necessario um update manual no banco de dados.


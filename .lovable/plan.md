
# Plano: Corrigir Mensagens de Broadcast que Nao Aparecem no Chat

## Problema Identificado

Quando uma mensagem de broadcast e enviada, ela **nao aparece no historico do chat** do lead. Apenas as respostas do cliente aparecem.

### Causa Raiz

No arquivo `supabase/functions/process-broadcast-queue/index.ts`, linha 906:

```typescript
if (conversationId!) {
  await supabase.from('whatsapp_messages').insert({...});
}
```

**Problemas:**

1. **Checagem incorreta**: `conversationId!` e uma asseracao de tipo TypeScript (non-null assertion), NAO uma verificacao booleana. Isso significa que o codigo sempre tenta executar o insert, mesmo quando `conversationId` esta undefined.

2. **Variavel nao inicializada**: Na linha 756, `conversationId` e declarada como `let conversationId: string;` sem valor inicial. Em cenarios de erro durante a criacao/atualizacao da conversa, a variavel pode permanecer sem valor.

3. **Silenciamento de erros**: O insert da mensagem nao tem tratamento de erro, entao falhas passam despercebidas nos logs.

## Solucao

### Modificacao no Edge Function

Arquivo: `supabase/functions/process-broadcast-queue/index.ts`

**Mudanca 1**: Inicializar a variavel corretamente (linha 756)

```typescript
// Antes
let conversationId: string;

// Depois  
let conversationId: string | undefined = undefined;
```

**Mudanca 2**: Corrigir a checagem antes do insert (linha 906)

```typescript
// Antes
if (conversationId!) {

// Depois
if (conversationId) {
```

**Mudanca 3**: Adicionar tratamento de erro e log para o insert da mensagem

```typescript
// Register message in chat history
if (conversationId) {
  const { error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      conversation_id: conversationId,
      direction: 'outgoing',
      message_type: queueItem.image_url ? 'image' : 'text',
      content: processedMessage,
      media_url: queueItem.image_url || null,
      status: 'sent',
      message_id_whatsapp: result.key?.id || null
    });
  
  if (msgError) {
    console.error(`[Broadcast] Erro ao salvar mensagem no chat:`, msgError.message);
  } else {
    console.log(`[Broadcast] Mensagem salva no historico do chat`);
  }
} else {
  console.error(`[Broadcast] Conversa nao encontrada/criada - mensagem nao foi salva no chat`);
}
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/process-broadcast-queue/index.ts` | Corrigir inicializacao, checagem e adicionar logs |

## Resultado Esperado

Apos a correcao:
1. Todas as mensagens de broadcast serao salvas corretamente na tabela `whatsapp_messages`
2. Quando o usuario abrir o chat de um lead, vera a mensagem inicial que foi enviada pelo broadcast
3. Erros serao logados para facilitar debug futuro

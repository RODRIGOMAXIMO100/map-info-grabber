
# Plano: Corrigir Atribuicao e Criacao de Leads no Broadcast

## Problema Identificado

As conversas de broadcast nao estao sendo criadas corretamente porque o codigo tenta inserir dados em uma coluna inexistente (`dna_id`).

### Causa Raiz

O codigo em `process-broadcast-queue/index.ts` referencia a coluna `dna_id` em dois lugares:

1. **Linha 765**: Tenta buscar `dna_id` da tabela `broadcast_lists` (coluna nao existe)
2. **Linha 826**: Tenta inserir `dna_id` na tabela `whatsapp_conversations` (coluna nao existe)

Quando o Supabase tenta inserir dados em uma coluna inexistente, a operacao falha e a conversa nao e criada. Por isso, das 10+ mensagens enviadas com sucesso, apenas 1 conversa foi criada (provavelmente em um cenario de race condition que usou outro caminho de codigo).

### Evidencia

- Lista de broadcast `Industrias - Vijay BH` tem `assigned_to: LUIZ OTAVIO`
- 10+ mensagens foram enviadas com status `sent`
- Apenas 1 conversa foi criada (Mantasul)
- A coluna `dna_id` NAO existe nas tabelas `broadcast_lists` e `whatsapp_conversations`

## Solucao

### Modificacao no Edge Function

Arquivo: `supabase/functions/process-broadcast-queue/index.ts`

**Mudanca 1**: Remover referencia a `dna_id` na query (linha 765)

```typescript
// Antes
.select('dna_id, assigned_to')

// Depois  
.select('assigned_to')
```

**Mudanca 2**: Remover `dna_id` do objeto de insercao (linha 826)

```typescript
// Antes
const conversationData = {
  ...
  dna_id: dnaId,
  assigned_to: assignedTo,
  ...
};

// Depois
const conversationData = {
  ...
  assigned_to: assignedTo,
  ...
};
```

**Mudanca 3**: Remover `dna_id` do objeto de update (linha 794)

```typescript
// Antes
dna_id: dnaId || undefined,
assigned_to: assignedTo || undefined,

// Depois
assigned_to: assignedTo || undefined,
```

**Mudanca 4**: Remover variavel `dnaId` nao utilizada (linha 760)

```typescript
// Antes
let dnaId: string | null = null;
let assignedTo: string | null = null;
...
dnaId = broadcastList?.dna_id || null;
assignedTo = broadcastList?.assigned_to || null;

// Depois
let assignedTo: string | null = null;
...
assignedTo = broadcastList?.assigned_to || null;
```

**Mudanca 5**: Adicionar `assigned_to` no fallback de race condition (linha 864-875)

```typescript
// Antes (fallback NAO inclui assigned_to)
const { error: fallbackUpdateError } = await supabase
  .from('whatsapp_conversations')
  .update({
    is_crm_lead: true,
    crm_funnel_id: defaultFunnelId,
    funnel_stage: defaultStageId || 'new',
    origin: 'broadcast',
    broadcast_list_id: queueItem.broadcast_list_id,
    broadcast_sent_at: new Date().toISOString(),
    followup_count: 0
  })
  .eq('id', conversationId);

// Depois (inclui assigned_to)
const { error: fallbackUpdateError } = await supabase
  .from('whatsapp_conversations')
  .update({
    is_crm_lead: true,
    crm_funnel_id: defaultFunnelId,
    funnel_stage: defaultStageId || 'new',
    origin: 'broadcast',
    broadcast_list_id: queueItem.broadcast_list_id,
    broadcast_sent_at: new Date().toISOString(),
    followup_count: 0,
    assigned_to: assignedTo  // ADICIONAR ATRIBUICAO
  })
  .eq('id', conversationId);
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/process-broadcast-queue/index.ts` | Remover todas as referencias a `dna_id` e corrigir fallback |

## Resultado Esperado

Apos a correcao:
1. Todas as conversas de broadcast serao criadas corretamente
2. O `assigned_to` sera atribuido corretamente a todos os leads
3. O `broadcast_list_id` sera salvo nas conversas
4. Mesmo em casos de race condition, o `assigned_to` sera aplicado

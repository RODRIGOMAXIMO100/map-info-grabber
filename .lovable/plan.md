

# Diagnóstico: Funil do Broadcast Não Sendo Aplicado

## Problema Confirmado

| Broadcast Config | Lead Criado |
|------------------|-------------|
| **Pizzaria Vijay Viçosa** | — |
| crm_funnel_id: `eacb974b...` (FUNIL AQUISIÇÃO) ✓ | — |
| crm_funnel_stage_id: `09e035a2...` (LEAD NOVO) ✓ | — |
| **Leads Recebidos** | **crm_funnel_id** |
| Casa da Pizza PN delivery | `48d3d4d9...` (FUNIL VENDA) ✗ |
| Voquerê Pizza e S2 Massas | `48d3d4d9...` (FUNIL VENDA) ✗ |
| Forno a Lenha Marguerita | `48d3d4d9...` (FUNIL VENDA) ✗ |

## Causa Raiz

A edge function `process-broadcast-queue` **não foi deployada corretamente**. O código no repositório está certo (linhas 306-315):

```typescript
if (queueItem.broadcast_list_id) {
  const { data: broadcastList } = await supabase
    .from('broadcast_lists')
    .select('assigned_to, crm_funnel_id, crm_funnel_stage_id')
    .eq('id', queueItem.broadcast_list_id).maybeSingle();
  broadcastFunnelId = broadcastList?.crm_funnel_id || null;
  broadcastStageId = broadcastList?.crm_funnel_stage_id || null;
}

const targetFunnelId = broadcastFunnelId || defaultFunnelId;  // ← CORRETO
const targetStageId = broadcastStageId || defaultStageId;
```

Porém, os logs mostram que o servidor está usando a versão antiga que ignora esses campos.

---

## Correções Necessárias

### 1. Corrigir os 3 leads manualmente

```sql
UPDATE whatsapp_conversations 
SET 
  crm_funnel_id = 'eacb974b-74b3-4a36-bedd-968426bc88a9',
  funnel_stage = '09e035a2-5490-433d-92ab-bf2045e96006'
WHERE id IN (
  'e98a3071-0272-443f-bb89-d899edcea746',  -- Casa da Pizza
  '80bd66a0-7717-48f6-a45d-8de2b6b763fa',  -- Voquerê Pizza
  'ddc44d82-a7f1-4bf9-9ca0-5a35bb897816'   -- Forno a Lenha
);
```

### 2. Forçar re-deploy da edge function

Tentar novamente o deploy com retry para garantir que a versão correta seja ativada.

### 3. Adicionar log de debug temporário

Adicionar log para confirmar que o funil do broadcast está sendo lido:

```typescript
console.log('[Broadcast] Using funnel from list:', broadcastFunnelId, 'stage:', broadcastStageId);
```

---

## Resumo das Ações

1. Executar SQL para corrigir os 3 leads
2. Re-deployar a edge function 
3. Validar nos logs que a nova versão está ativa


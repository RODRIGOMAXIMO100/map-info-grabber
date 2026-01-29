
# Plano: Corrigir Atribuicao Automatica de Leads do Broadcast

## ✅ IMPLEMENTADO

### Problema Identificado
Quando um lead responde a um disparo (broadcast), o sistema NAO estava atribuindo a conversa ao usuario responsavel configurado na lista de broadcast.

### Solucao Aplicada

**Arquivo Modificado:** `supabase/functions/whatsapp-receive-webhook/index.ts`

1. ✅ Query alterada para incluir join com `broadcast_lists` e buscar `assigned_to`
2. ✅ Nova variavel `broadcastAssignedTo` para armazenar o responsavel
3. ✅ `assigned_to` e `assigned_at` incluidos no upsert da conversa

### Resultado

- Novas conversas de leads que respondem a broadcasts serao automaticamente atribuidas ao responsavel configurado na lista
- O responsavel vera a conversa na aba "Minhas Conversas"
- Notificacoes irao para o usuario correto

### Observacao

Esta correcao afeta apenas NOVAS conversas. Para corrigir conversas ja criadas sem atribuicao, execute manualmente:

```sql
UPDATE whatsapp_conversations wc
SET 
  assigned_to = bl.assigned_to,
  assigned_at = NOW()
FROM broadcast_lists bl
WHERE wc.broadcast_list_id = bl.id
  AND wc.assigned_to IS NULL
  AND bl.assigned_to IS NOT NULL;
```

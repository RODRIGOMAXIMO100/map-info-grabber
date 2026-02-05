

# Diagnóstico: Lead caiu no funil errado após disparo

## Problema Identificado

O lead "Loja dos Brinquedos" foi configurado para o **FUNIL AQUISIÇÃO** no disparo, mas caiu no **FUNIL VENDA** (funil padrão).

### Causa Raiz

A edge function `process-broadcast-queue` **não foi deployada a tempo** quando o broadcast foi processado:

| Evento | Horário | Detalhe |
|--------|---------|---------|
| Broadcast list criada | 18:19:47 | Com `crm_funnel_id` = FUNIL AQUISIÇÃO ✓ |
| Mensagem enviada | 18:21:05 | Lead criado com FUNIL VENDA (default) ✗ |
| Deploy tentativa | - | Timeout por arquivo grande |

O deploy teve timeout (arquivo com 1099 linhas) e a versão antiga da function foi usada, que não tinha suporte ao `crm_funnel_id`.

---

## Correções Necessárias

### 1. Corrigir o lead manualmente

Atualizar o lead "Loja dos Brinquedos" para o funil correto:

```sql
UPDATE whatsapp_conversations 
SET 
  crm_funnel_id = 'eacb974b-74b3-4a36-bedd-968426bc88a9',  -- FUNIL AQUISIÇÃO
  funnel_stage = '09e035a2-5490-433d-92ab-bf2045e96006'   -- Etapa configurada
WHERE id = 'c4ddc9f8-d1ad-4ddc-9449-fbb86b8338aa';
```

### 2. Re-deployar a edge function

Tentar novamente o deploy da `process-broadcast-queue` para garantir que próximos disparos funcionem corretamente.

### 3. Testar com novo disparo

Após o deploy, fazer um disparo teste para validar que o funil e etapa são atribuídos corretamente.

---

## Seção Técnica

### Código da edge function (correto)

O código já busca os campos corretamente:

```typescript
// Buscar configuração de funil da broadcast list
const { data: broadcastList } = await supabase
  .from('broadcast_lists')
  .select('assigned_to, crm_funnel_id, crm_funnel_stage_id')
  .eq('id', queueItem.broadcast_list_id)
  .maybeSingle();

// Priorizar funil/etapa do broadcast, senão usar default
const targetFunnelId = broadcastFunnelId || defaultFunnelId;
const targetStageId = broadcastStageId || defaultStageId;
```

### Ação requerida

Aprovar este plano para:
1. Executar a correção SQL do lead
2. Re-deployar a edge function
3. Validar funcionamento



# Plano: Corrigir Visibilidade de Lembretes - Campo reminder_created_by Ausente

## Problema Identificado

O campo `reminder_created_by` nao esta sendo incluido nas queries de SELECT das conversas. Isso causa:

1. O hook `useReminderNotifications` recebe `reminder_created_by = undefined`
2. A verificacao de criador falha: `conv.reminder_created_by === userId` sempre retorna `false`
3. O fallback `!conv.reminder_created_by && conv.assigned_to === userId` sempre ativa para leads atribuidos
4. Resultado: notificacoes aparecem para o usuario atribuido, nao para o criador

## Evidencias

Dados do lembrete atual:
- Lead: Euripedes Cavalcante
- `reminder_created_by`: LUIZ OTAVIO (8c2d85a0-...)
- `assigned_to`: RODRIGO POLITICA (1b9046d0-...)

Queries atuais (sem o campo):
```typescript
// CRMKanban.tsx linha 250-258
.select(`
  id, phone, name, avatar_url, status, notes,
  last_message_at, last_message_preview, unread_count,
  ai_paused, ai_handoff_reason, funnel_stage, crm_funnel_id,
  is_crm_lead, is_group, assigned_to, reminder_at, estimated_value, closed_value,
  custom_tags, tags, lead_city, lead_state, contacted_by_instances,
  origin, broadcast_list_id, updated_at, pinned, video_sent, site_sent, created_at,
  broadcast_lists:broadcast_list_id (name)
`)
```

---

## Solucao

### 1. Adicionar `reminder_created_by` nas Queries de SELECT

Alterar os 3 arquivos que carregam conversas com lembretes:

**CRMKanban.tsx (linha 254)**:
```typescript
.select(`
  id, phone, name, avatar_url, status, notes,
  last_message_at, last_message_preview, unread_count,
  ai_paused, ai_handoff_reason, funnel_stage, crm_funnel_id,
  is_crm_lead, is_group, assigned_to, reminder_at, reminder_created_by, estimated_value, closed_value,
  ...
`)
```

**WhatsAppChat.tsx (linha 300)**:
```typescript
.select(`
  ...
  reminder_at, reminder_created_by, estimated_value, closed_value, custom_tags, tags,
  ...
`)
```

**Reminders.tsx** - Ja usa `select('*')` entao esta OK.

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/CRMKanban.tsx` | Adicionar `reminder_created_by` no select (linha 254) |
| `src/pages/WhatsAppChat.tsx` | Adicionar `reminder_created_by` no select (linha 300) |

---

## Fluxo Corrigido

```text
Query carrega conversations com reminder_created_by
       |
       v
useReminderNotifications recebe dados completos
       |
       v
Verifica: reminder_created_by === userId?
       |
       +-- SIM --> Mostra notificacao
       |
       +-- NAO --> Verifica fallback (creator null AND assigned)
                   |
                   +-- SIM --> Mostra notificacao (dados legados)
                   |
                   +-- NAO --> Nao mostra
```

---

## Resultado Esperado

Apos a correcao:
- Luiz Otavio vera notificacoes dos lembretes que criou
- Rodrigo Politica NAO vera notificacoes de lembretes criados por outros
- O fallback so ativara para lembretes antigos sem criador definido

---

## Resumo Tecnico

O bug ocorreu porque o campo `reminder_created_by` foi adicionado a tabela e ao codigo de salvamento, mas nao foi incluido nas queries de SELECT. A correcao e simples: adicionar o campo nas 2 queries existentes.

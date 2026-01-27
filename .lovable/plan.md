
# Plano: Corrigir Visibilidade de Lembretes para Luiz

## Problema Identificado

O lembrete agendado para o lead "Euripedes Cavalcante" tem `reminder_created_by = NULL`. Isso acontece porque:

1. A coluna `reminder_created_by` foi adicionada em 26/01/2026
2. O lembrete foi criado ou atualizado sem preencher este campo
3. O sistema filtra lembretes onde `reminder_created_by = user_id` para nao-admins
4. Como o campo esta vazio, Luiz nao consegue ver o lembrete que criou

---

## Solucao Proposta

### 1. Correcao Imediata: Atribuir o lembrete ao Luiz

Executar uma query para preencher o `reminder_created_by` do lembrete existente com o ID do Luiz (ja que ele e o usuario atribuido ao lead).

```sql
UPDATE whatsapp_conversations 
SET reminder_created_by = '8c2d85a0-2390-4ee0-b108-82661d0b6057'
WHERE id = '52f6ab3b-f136-4bb0-b829-c658599df238'
AND reminder_at IS NOT NULL;
```

### 2. Correcao de Codigo: Evitar Futuros Problemas

#### A) Corrigir `handleRemoveReminder` no CRMKanban.tsx

Quando remover um lembrete, limpar tambem o `reminder_created_by`:

```typescript
// Linha 565 de CRMKanban.tsx
.update({ 
  reminder_at: null, 
  reminder_created_by: null,  // Adicionar esta linha
  updated_at: new Date().toISOString() 
})
```

#### B) Corrigir `handleRemoveReminder` no WhatsAppChat.tsx

Mesmo ajuste para consistencia:

```typescript
// Linha 618-620 de WhatsAppChat.tsx
.update({ 
  reminder_at: null, 
  reminder_created_by: null,  // Adicionar esta linha
  updated_at: new Date().toISOString() 
})
```

#### C) Fallback de Seguranca na Query de Lembretes

Modificar a logica de filtro para tambem considerar lembretes onde `assigned_to = user_id` como alternativa, caso `reminder_created_by` esteja vazio:

```typescript
// Em Reminders.tsx, linha 71-73
if (!isAdmin && user?.id) {
  query = query.or(`reminder_created_by.eq.${user.id},and(reminder_created_by.is.null,assigned_to.eq.${user.id})`);
}
```

Isso garante que:
- Lembretes criados pelo usuario sao visiveis (comportamento normal)
- Lembretes sem criador mas atribuidos ao usuario tambem aparecem (fallback para dados antigos)

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/CRMKanban.tsx` | Adicionar `reminder_created_by: null` no `handleRemoveReminder` |
| `src/pages/WhatsAppChat.tsx` | Adicionar `reminder_created_by: null` no `handleRemoveReminder` |
| `src/pages/Reminders.tsx` | Adicionar fallback para `assigned_to` quando `reminder_created_by` for null |
| `src/hooks/useReminderNotifications.ts` | Adicionar mesma logica de fallback para notificacoes |

---

## Fluxo Corrigido

```text
Lembrete sem criador definido?
       |
       +-- reminder_created_by = user_id? --> Mostra
       |
       +-- reminder_created_by IS NULL 
           AND assigned_to = user_id? --> Mostra (fallback)
       |
       +-- Nenhuma condicao? --> Nao mostra
```

---

## Resultado Esperado

1. Luiz vera imediatamente o lembrete apos a correcao de dados
2. Futuros lembretes serao rastreados corretamente
3. Dados legados (sem criador) ainda serao visiveis para o vendedor atribuido
4. Remocao de lembretes limpa ambos os campos para consistencia

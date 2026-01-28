
# Plano: Corrigir Visibilidade de Lembretes - Badge e Verificacao

## Problemas Identificados

### Problema 1: Badge no Sidebar
O badge de lembretes no AppSidebar.tsx conta TODOS os lembretes sem filtrar por criador:

```typescript
// AppSidebar.tsx linha 121-127 - ATUAL (incorreto)
const { count: reminders } = await supabase
  .from('whatsapp_conversations')
  .select('*', { count: 'exact', head: true })
  .not('reminder_at', 'is', null)
  .lte('reminder_at', today.toISOString());
```

Resultado: Todos os usuarios veem o mesmo contador de lembretes.

### Problema 2: Dados no Banco
O banco mostra que o lembrete foi criado por LUIZ:
- reminder_created_by: LUIZ OTAVIO (8c2d85a0...)
- assigned_to: RODRIGO POLITICA (1b9046d0...)

Se RODRIGO criou o lembrete, o ID deveria ser dele. Isso sugere que quando salvou, o user?.id estava errado.

---

## Solucao

### 1. Corrigir Badge no AppSidebar

Filtrar lembretes por criador (para nao-admins):

```typescript
// DEPOIS (correto)
let query = supabase
  .from('whatsapp_conversations')
  .select('*', { count: 'exact', head: true })
  .not('reminder_at', 'is', null)
  .lte('reminder_at', today.toISOString());

// Non-admins only see reminders they created OR legacy ones assigned to them
if (!isAdmin && user?.id) {
  query = query.or(`reminder_created_by.eq.${user.id},and(reminder_created_by.is.null,assigned_to.eq.${user.id})`);
}

const { count: reminders } = await query;
```

### 2. Adicionar Log de Debug ao Salvar Lembrete

Para verificar se o user?.id esta correto ao salvar:

```typescript
// CRMKanban.tsx - handleSaveReminder
const handleSaveReminder = async (date: Date) => {
  if (!reminderModal.lead) return;

  console.log('[Reminder Save] User ID:', user?.id, 'Profile:', profile?.full_name);

  try {
    await supabase
      .from('whatsapp_conversations')
      .update({ 
        reminder_at: date.toISOString(), 
        reminder_created_by: user?.id, // Verificar se este valor esta correto
        updated_at: new Date().toISOString() 
      })
      .eq('id', reminderModal.lead.id);
    // ...
  }
};
```

### 3. Verificar AuthContext

Garantir que user?.id vem da sessao ativa do Supabase Auth, nao de cache.

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/AppSidebar.tsx` | Filtrar badge de lembretes por criador |
| `src/pages/CRMKanban.tsx` | Adicionar log ao salvar lembrete |
| `src/pages/WhatsAppChat.tsx` | Adicionar log ao salvar lembrete |

---

## Fluxo Corrigido

```text
Usuario nao-admin logado
       |
       v
AppSidebar conta lembretes
       |
       v
Filtra: reminder_created_by = user.id
    OR (creator null AND assigned_to = user.id)
       |
       v
Badge mostra apenas SEUS lembretes
```

---

## Resultado Esperado

Apos a correcao:
- Badge no sidebar mostrara apenas lembretes criados pelo usuario logado
- Logs ajudarao a identificar se ha problema ao capturar user?.id
- Se o problema persistir, os logs mostrarao se o ID esta errado ao salvar

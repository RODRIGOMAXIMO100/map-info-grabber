

## Plano: Lembretes Visíveis Apenas Para Quem Criou

### Problema Identificado
Atualmente, os lembretes são armazenados apenas com o campo `reminder_at` na tabela `whatsapp_conversations`. **Não há registro de quem criou o lembrete**, então todos os usuários veem todos os lembretes do sistema.

### Solução Proposta
Adicionar um novo campo `reminder_created_by` na tabela `whatsapp_conversations` para rastrear o criador do lembrete, e filtrar a exibição para mostrar apenas lembretes criados pelo usuário logado.

---

### Alterações Necessárias

#### 1. Migração SQL - Adicionar Coluna

```sql
-- Adicionar coluna para rastrear quem criou o lembrete
ALTER TABLE public.whatsapp_conversations 
ADD COLUMN reminder_created_by uuid REFERENCES auth.users(id);

-- Criar índice para melhorar performance de consultas
CREATE INDEX idx_conversations_reminder_created_by 
ON public.whatsapp_conversations(reminder_created_by);
```

#### 2. Atualizar Criação de Lembretes

**Arquivos a modificar:**
- `src/pages/CRMKanban.tsx` - função `handleSaveReminder`
- `src/pages/WhatsAppChat.tsx` - função `handleSaveReminder`

**Lógica:**
Ao salvar um lembrete, incluir o `user.id` no campo `reminder_created_by`:
```typescript
await supabase
  .from('whatsapp_conversations')
  .update({ 
    reminder_at: date.toISOString(),
    reminder_created_by: user?.id,  // NOVO
    updated_at: new Date().toISOString() 
  })
  .eq('id', conv.id);
```

#### 3. Filtrar Lembretes por Criador

**Arquivo:** `src/pages/Reminders.tsx`

Modificar a query para filtrar por `reminder_created_by`:
```typescript
const { user, isAdmin } = useAuth();

let query = supabase
  .from('whatsapp_conversations')
  .select('*')
  .not('reminder_at', 'is', null)
  .order('reminder_at', { ascending: true });

// Admins veem todos, outros usuários só veem os próprios
if (!isAdmin && user?.id) {
  query = query.eq('reminder_created_by', user.id);
}
```

#### 4. Filtrar Notificações de Lembretes

**Arquivo:** `src/hooks/useReminderNotifications.ts`

Receber o `userId` como parâmetro e filtrar:
```typescript
interface UseReminderNotificationsOptions {
  conversations: WhatsAppConversation[];
  userId?: string;  // NOVO
  isAdmin?: boolean;  // NOVO
  onReminderTriggered?: (conv: WhatsAppConversation) => void;
}

// Dentro do checkReminders:
conversations
  .filter(conv => {
    if (!conv.reminder_at) return false;
    // Admins recebem todas notificações, outros só as próprias
    if (!isAdmin && userId && conv.reminder_created_by !== userId) return false;
    return true;
  })
  .forEach(...)
```

#### 5. Atualizar RemindersPanel (CRM)

O `RemindersPanel` recebe as conversas já filtradas pelo CRM Kanban (que já filtra por `assigned_to`). Porém, para garantir consistência, o filtro de lembretes também deve considerar `reminder_created_by`.

#### 6. Limpar ao Remover Lembrete

Quando um lembrete é removido, também limpar o `reminder_created_by`:
```typescript
await supabase
  .from('whatsapp_conversations')
  .update({ 
    reminder_at: null, 
    reminder_created_by: null,  // NOVO
    updated_at: new Date().toISOString() 
  })
  .eq('id', conv.id);
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Adicionar coluna `reminder_created_by` |
| `src/pages/CRMKanban.tsx` | Salvar `user.id` ao criar lembrete |
| `src/pages/WhatsAppChat.tsx` | Salvar `user.id` ao criar lembrete |
| `src/pages/Reminders.tsx` | Filtrar lembretes por `reminder_created_by` |
| `src/hooks/useReminderNotifications.ts` | Filtrar notificações por criador |
| `src/types/whatsapp.ts` | Adicionar tipo `reminder_created_by` |

---

### Comportamento Final

| Usuário | Vê Lembretes |
|---------|--------------|
| Admin | Todos os lembretes do sistema |
| SDR/Closer | Apenas lembretes que ELE criou |

---

### Nota Técnica

Lembretes existentes (criados antes desta mudança) terão `reminder_created_by = null`. Opcionalmente, podemos:
1. **Ignorar lembretes antigos** para não-admins (mais restritivo)
2. **Mostrar lembretes antigos** para todos até que sejam recriados (mais permissivo)

A opção 1 é mais segura para privacidade.


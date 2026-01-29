
# Plano: Investigar Bug de Atribuicao de Lembretes e Adicionar Transparencia

## Problema Reportado
O usuario afirma que Rodrigo Politica criou um lembrete, mas o banco de dados registrou `reminder_created_by` como Luiz Otavio.

## Dados do Banco
| Campo | Valor | Identificacao |
|-------|-------|---------------|
| `reminder_created_by` | `8c2d85a0-2390-4ee0-b108-82661d0b6057` | LUIZ OTAVIO |
| `assigned_to` | `1b9046d0-b48f-47fd-a7bd-995ebd06e862` | RODRIGO POLITICA |
| `updated_at` | 26/01/2026 17:26:42 | Data da criacao |

## Possiveis Causas

1. **Sessao compartilhada**: Rodrigo estava usando o navegador com a conta do Luiz logada
2. **Cache do AuthContext**: O estado `user?.id` estava desatualizado
3. **Race condition**: O contexto de autenticacao nao estava pronto quando o lembrete foi salvo

## Solucao Proposta

### Fase 1: Adicionar Logs de Debug (Imediato)
Adicionar console.logs no momento da criacao do lembrete para rastrear futuras ocorrencias:

**Arquivo:** `src/pages/CRMKanban.tsx` e `src/pages/WhatsAppChat.tsx`
- Ja existe um log basico: `console.log('[CRM Reminder Save] User ID:', user?.id, 'Profile:', profile?.full_name)`
- Vou manter e garantir que esta funcionando

### Fase 2: Adicionar Transparencia Visual
Mostrar no card do lembrete quem criou vs quem esta atribuido, para evitar confusao:

**Arquivo:** `src/pages/Reminders.tsx`
- Adicionar join com `profiles` para buscar o nome do criador
- Mostrar badge indicando "Criado por: [Nome]" quando o criador for diferente do usuario atual
- Isso ajudara a identificar se o problema ocorrer novamente

### Fase 3: Correcao do Lembrete Atual
Corrigir o registro atual para atribuir o `reminder_created_by` ao Rodrigo Politica:

```sql
UPDATE whatsapp_conversations 
SET reminder_created_by = '1b9046d0-b48f-47fd-a7bd-995ebd06e862' -- Rodrigo Politica
WHERE id = '52f6ab3b-f136-4bb0-b829-c658599df238';
```

## Alteracoes nos Arquivos

### 1. `src/pages/Reminders.tsx`
- Modificar query para incluir join com `profiles` para buscar `creator_name`
- Adicionar badge visual mostrando quem criou o lembrete
- Ajudar a identificar discrepancias futuras

### 2. `src/components/crm/ReminderModal.tsx`
- Mostrar informacao de quem criou o lembrete atual (quando existir)

## Resultado Esperado

1. Lembrete atual sera corrigido para mostrar Rodrigo Politica como criador
2. A notificacao ira para Rodrigo (o criador correto)
3. Interface mostrara visualmente quem criou cada lembrete
4. Logs ajudarao a identificar se o bug ocorrer novamente no futuro

---

## Detalhes Tecnicos

A lógica atual de atribuicao usa `user?.id` do contexto de autenticacao (`useAuth()`), que vem da sessao do usuario logado. Se o ID errado foi salvo, significa que:

1. A sessao estava incorreta no momento da criacao, OU
2. O usuario estava logado com outra conta

A adicao de logs e transparencia visual ajudara a prevenir e diagnosticar ocorrencias futuras.

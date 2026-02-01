

# Plano: Fluxo de Adicionar Contato Random ao CRM com Escolha de Etapa

## Contexto

Quando um contato "aleatório" manda mensagem:
1. A conversa é criada com `is_crm_lead: false` (correto - atendente decide)
2. A conversa aparece no chat (funcionando)
3. O atendente precisa "assumir" e depois escolher em qual funil/etapa adicionar

Atualmente:
- O menu tem "Ativar Lead" que marca como lead automaticamente com etapa padrão
- Para escolher etapa, tem que ativar primeiro e depois mudar a etapa pelo submenu

O que você quer:
- Poder escolher a etapa NO MOMENTO de adicionar ao CRM

## Solucao

Adicionar um botão/menu "Adicionar ao CRM" no `LeadControlPanelCompact` que abre o `QuickAddLeadModal` (que já existe e permite escolher etapa) quando a conversa NÃO é lead.

## Modificacoes Tecnicas

### 1. Arquivo: `src/components/whatsapp/LeadControlPanelCompact.tsx`

Adicionar prop callback para abrir o modal de adicionar ao CRM:

```typescript
interface LeadControlPanelCompactProps {
  // ... props existentes
  onAddToCRM?: (phone: string, name?: string) => void; // NOVA PROP
}
```

No menu dropdown, substituir "Ativar Lead" por lógica condicional:

```typescript
{/* Adicionar ao CRM - para não-leads */}
{!isCrmLead && onAddToCRM && (
  <DropdownMenuItem onClick={() => onAddToCRM(conversation.phone, conversation.name)} className="text-xs">
    <UserPlus className="h-3.5 w-3.5 mr-2" />
    Adicionar ao CRM
  </DropdownMenuItem>
)}

{/* Toggle Lead - manter para leads já existentes */}
{isCrmLead && (
  <DropdownMenuItem onClick={handleToggleLead} className="text-xs">
    <UserX className="h-3.5 w-3.5 mr-2" />
    Remover do CRM
  </DropdownMenuItem>
)}
```

### 2. Arquivo: `src/pages/WhatsAppChat.tsx`

Passar o callback `onAddToCRM` para o `LeadControlPanelCompact`:

```typescript
<LeadControlPanelCompact
  conversation={selectedConversation}
  onAddToCRM={(phone, name) => {
    setQuickAddLeadPhone(phone);
    setQuickAddLeadName(name);
    setQuickAddLeadOpen(true);
  }}
  // ... outras props
/>
```

### 3. Arquivo: `src/components/crm/QuickAddLeadModal.tsx`

Já foi corrigido para atualizar conversas existentes que não são leads. Agora quando você abre o modal para um contato que já existe no banco (mas não é lead), ele vai atualizar corretamente.

## Fluxo Final

1. Contato "random" manda mensagem
2. Conversa aparece no chat com `is_crm_lead: false`
3. Atendente abre a conversa e clica no menu (tres pontinhos)
4. Vê opcao "Adicionar ao CRM" (ao inves de "Ativar Lead")
5. Clica e abre o modal `QuickAddLeadModal`
6. Escolhe a etapa desejada
7. Clica "Adicionar"
8. Sistema atualiza a conversa: `is_crm_lead: true`, `funnel_stage: [escolhida]`, `crm_funnel_id: [padrao]`
9. Lead aparece no CRM Kanban na etapa escolhida

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/whatsapp/LeadControlPanelCompact.tsx` | Adicionar prop `onAddToCRM` e mostrar botao "Adicionar ao CRM" para nao-leads |
| `src/pages/WhatsAppChat.tsx` | Passar callback `onAddToCRM` para o LeadControlPanelCompact |

## Resultado Esperado

- Contatos "random" aparecem no chat
- Atendente pode adicionar ao CRM escolhendo a etapa
- Modal permite escolher funil e etapa antes de confirmar
- Conversa existente e atualizada corretamente (bug ja corrigido)


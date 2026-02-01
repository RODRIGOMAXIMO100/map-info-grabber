
# Plano: Diagnosticar e Corrigir "Definir Funil" Não Aparecendo

## Problema Identificado

O código para exibir "Definir Funil" foi adicionado, mas a opção não está aparecendo no menu. As condições são:

```typescript
{isCrmLead && !currentFunnelId && onAddToCRM && conversation.phone && (...)}
```

Dados do lead `555499574586`:
- `is_crm_lead: true` ✅
- `crm_funnel_id: null` → `currentFunnelId = ''` → `!currentFunnelId = true` ✅
- `onAddToCRM`: passado no WhatsAppChat.tsx ✅
- `conversation.phone: '555499574586'` ✅

Teoricamente, todas as condições são satisfeitas. Possíveis causas:
1. Build não foi aplicado / cache do navegador
2. O menu renderiza mas está oculto por algum motivo
3. Há outra condição que não está sendo satisfeita

## Solução Proposta

### Passo 1: Adicionar console.log temporário para diagnóstico

No `LeadControlPanelCompact.tsx`, adicionar um log para verificar os valores em tempo real:

```typescript
// Perto da linha 121-127, após definir as variáveis
useEffect(() => {
  console.log('[Definir Funil Debug]', {
    isCrmLead,
    currentFunnelId,
    hasOnAddToCRM: !!onAddToCRM,
    phone: conversation.phone,
    shouldShowDefinirFunil: isCrmLead && !currentFunnelId && !!onAddToCRM && !!conversation.phone
  });
}, [isCrmLead, currentFunnelId, onAddToCRM, conversation.phone]);
```

### Passo 2: Verificar valor de `currentFunnelId`

O problema pode ser que `currentFunnelId` não está sendo avaliado como falsy corretamente. Vou alterar a lógica para ser mais explícita:

```typescript
// Linha 121 - antes
const currentFunnelId = conversation.crm_funnel_id || '';

// Alterar para ser mais explícito na verificação
const currentFunnelId = conversation.crm_funnel_id;
const hasNoFunnel = !currentFunnelId || currentFunnelId === '';
```

E na condição (linha 857):
```typescript
// Antes
{isCrmLead && !currentFunnelId && onAddToCRM && conversation.phone && (...)}

// Depois
{isCrmLead && hasNoFunnel && onAddToCRM && conversation.phone && (...)}
```

### Passo 3: Forçar visibilidade da opção para teste

Temporariamente, mostrar a opção sempre (independente das condições) para confirmar que o menu está renderizando:

```typescript
{/* Sempre mostrar para teste - remover depois */}
{onAddToCRM && conversation.phone && (
  <DropdownMenuItem 
    onClick={() => onAddToCRM(conversation.phone!, conversation.name || undefined, conversation.config_id)} 
    className="text-xs text-amber-600"
  >
    <UserPlus className="h-3.5 w-3.5 mr-2" />
    Definir Funil (DEBUG: funnel={currentFunnelId || 'null'} crm={String(isCrmLead)})
  </DropdownMenuItem>
)}
```

### Passo 4: Verificar e aplicar nos dois lugares (mobile e desktop)

O arquivo tem duas renderizações do menu:
- **Mobile** (linha ~452): Para `isMobile={true}`
- **Desktop** (linha ~857): Para `isMobile={false}`

Preciso garantir que ambas estão atualizadas corretamente.

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/whatsapp/LeadControlPanelCompact.tsx` | Adicionar logging de diagnóstico e melhorar a lógica de verificação de `currentFunnelId` |

## Plano de Teste

1. Aplicar as alterações
2. Pedir ao usuário para recarregar a página (Ctrl+Shift+R para limpar cache)
3. Abrir o chat do `555499574586`
4. Clicar no menu (3 pontinhos)
5. Verificar se "Definir Funil" aparece
6. Se não aparecer, verificar o console do navegador para ver os logs de debug
7. Uma vez funcionando, remover os logs de debug

## Próximos Passos Após Funcionar

Uma vez que o problema for resolvido:
1. Remover console.logs de debug
2. Confirmar que o modal abre ao clicar em "Definir Funil"
3. Confirmar que após selecionar funil/etapa, o lead é atualizado corretamente

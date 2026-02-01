
## Objetivo (o que vai mudar)
Hoje o modal **QuickAddLeadModal** só deixa escolher **Etapa** e sempre usa o **funil padrão** (`useDefaultFunnel`). Por isso você “não consegue escolher para qual funil ele vai” — a UI simplesmente não oferece essa escolha.

Vamos atualizar o fluxo “Adicionar ao CRM” no chat para permitir:
- Selecionar **Funil**
- Selecionar **Etapa** (carregada dinamicamente conforme o funil escolhido)
- Manter o comportamento atual de “assumir primeiro / depois escolher funil e etapa” (não vamos auto-promover contatos random no backend)

## Causa raiz (confirmada no código)
Arquivo `src/components/crm/QuickAddLeadModal.tsx`:
- Usa `useDefaultFunnel()` e passa `defaultFunnel?.id` para `useStages()`
- Na hora de salvar, faz `crm_funnel_id: defaultFunnel?.id`
- Não existe estado/Select para `funnelId`

Ou seja: mesmo abrindo o modal pelo chat, ele sempre joga para o funil default.

## Solução proposta (frontend)
### 1) Adicionar seleção de Funil no QuickAddLeadModal
**Arquivo:** `src/components/crm/QuickAddLeadModal.tsx`

Mudanças:
- Criar estado `funnelId`
- Buscar lista de funis disponíveis com `useFunnels()` (não só default)
- Mostrar um `<Select>` “Funil” acima de “Etapa”
- Quando o usuário mudar o funil:
  - atualizar `funnelId`
  - recarregar `stages` com `useStages(funnelId)`
  - resetar `stageId` para o **primeiro estágio** do novo funil (quando carregar)
- Ao salvar:
  - usar `crm_funnel_id: funnelId` (em vez de `defaultFunnel?.id`)
  - manter `funnel_stage: stageId` como já está

Validações:
- Se não tiver `funnelId`: erro “Selecione um funil”
- Se não tiver `stageId`: erro “Selecione um estágio”
- Se não tiver `configId`: erro “Selecione uma instância de WhatsApp”

Comportamento inteligente:
- Se o usuário só tiver 1 funil disponível (pela permissão/atribuição), podemos:
  - setar automaticamente
  - opcionalmente esconder o Select de funil (para não poluir), mas manter a lógica funcionando

### 2) Ajustar inicialização do modal (ao abrir)
Ainda em `QuickAddLeadModal.tsx`:
- No `useEffect` que roda quando `open`:
  - definir `funnelId` como:
    1) `defaultFunnel?.id` se existir
    2) senão o primeiro funil retornado por `useFunnels()`
- Definir `stageId` com base no funil escolhido (primeiro estágio daquele funil)

Isso evita ficar com “Etapa vazia” quando trocar funil ou quando o funil default não estiver disponível para o usuário.

### 3) Manter o fluxo do chat como está (só abrindo modal)
**Arquivos:** já alterados
- `src/components/whatsapp/LeadControlPanelCompact.tsx`
- `src/pages/WhatsAppChat.tsx`

Não precisamos mexer de novo neles para suportar “escolher funil”, porque a seleção vai acontecer dentro do modal.

## Observações importantes (por que pode “parecer que não mudou”)
Mesmo com a UI do funil:
- Se seu usuário só tem **1 funil permitido** (por regra de acesso), o Select pode mostrar só 1 opção. Ainda assim vai funcionar, mas “parece que não tem escolha”.
- Se você espera ver vários funis e aparece só 1, isso é permissão/atribuição (quem pode ver qual funil). Aí precisamos checar se o usuário está atribuído a mais de um funil.

## Plano de teste (passo a passo)
1) Abrir o chat do `555499574586`
2) Menu (3 pontinhos) → **Adicionar ao CRM**
3) Confirmar que o modal agora mostra:
   - Funil (Select)
   - Etapa (Select)
   - Instância
4) Selecionar um funil diferente e confirmar que:
   - a lista de etapas muda conforme o funil
5) Clicar em “Adicionar”
6) Confirmar que o lead aparece no CRM no funil/etapa escolhidos

## Arquivos que serão modificados
- `src/components/crm/QuickAddLeadModal.tsx`
- (possivelmente) `src/hooks/useFunnels.ts` apenas se precisarmos de um helper de “funil selecionável”, mas a princípio não.

## Riscos / cuidados
- Carregamento assíncrono: precisamos tomar cuidado para não setar `stageId` antes de `stages` carregar.
- Se não houver funis disponíveis para o usuário (lista vazia), o modal deve mostrar erro claro (“Você não tem funis disponíveis”) em vez de falhar silenciosamente.


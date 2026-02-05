
# Plano: Seleção de Funil, Etapa e Usuário no Disparo

## Contexto Atual
O sistema já possui o seletor de **Responsável** (usuário) na tela de configuração do disparo. Vamos adicionar os seletores de **Funil** e **Etapa** para que o usuário possa definir exatamente onde os leads serão inseridos no CRM.

## Mudanças Necessárias

### 1. Banco de Dados (Migração SQL)

Adicionar duas colunas na tabela `broadcast_lists`:

```sql
ALTER TABLE broadcast_lists 
ADD COLUMN crm_funnel_id UUID REFERENCES crm_funnels(id),
ADD COLUMN crm_funnel_stage_id UUID REFERENCES crm_funnel_stages(id);
```

### 2. Interface de Tipos

Atualizar `src/types/whatsapp.ts` para incluir os novos campos na interface `BroadcastList`:

```typescript
export interface BroadcastList {
  // ... campos existentes ...
  crm_funnel_id?: string | null;
  crm_funnel_stage_id?: string | null;
}
```

### 3. Frontend - Tela de Configuração do Disparo

Modificar `src/pages/BroadcastDetails.tsx`:

**Novos imports:**
```typescript
import { useFunnels } from '@/hooks/useFunnels';
import { useStages } from '@/hooks/useStages';
```

**Novos estados:**
```typescript
const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
```

**Layout da seção de configuração CRM** (após o seletor de mídia, junto com o seletor de usuário existente):

```text
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Configuração do CRM                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Atribuir leads para:  [▼ Selecione um usuário...            ]  │
│                                                                 │
│ Funil:                [▼ FUNIL AQUISIÇÃO                    ]  │
│ Etapa inicial:        [▼ Lead Novo                          ]  │
│                                                                 │
│ ⓘ Os leads deste disparo serão inseridos automaticamente no   │
│   funil e etapa selecionados, atribuídos ao usuário escolhido. │
└─────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Ao selecionar um funil, carregar as etapas daquele funil
- Ao mudar o funil, resetar a etapa para a primeira disponível
- Valor padrão: funil com `is_default = true` e primeira etapa
- Ao salvar, persistir `crm_funnel_id` e `crm_funnel_stage_id`

### 4. Função saveMessage

Atualizar para incluir os novos campos:

```typescript
const { error } = await supabase
  .from('broadcast_lists')
  .update({ 
    message_template: editedMessage,
    image_url: editedImageUrl || null,
    assigned_to: selectedAssignee || null,
    crm_funnel_id: selectedFunnelId || null,      // NOVO
    crm_funnel_stage_id: selectedStageId || null, // NOVO
    updated_at: new Date().toISOString()
  })
  .eq('id', list.id);
```

### 5. Edge Function - Processamento do Disparo

Modificar `supabase/functions/process-broadcast-queue/index.ts`:

**Atualizar query que busca dados da lista:**
```typescript
const { data: broadcastList } = await supabase
  .from('broadcast_lists')
  .select('assigned_to, crm_funnel_id, crm_funnel_stage_id')
  .eq('id', queueItem.broadcast_list_id)
  .maybeSingle();
```

**Usar valores da lista na criação/atualização de conversas:**
```typescript
// Se a lista tem funil/etapa configurados, usar esses valores
// Senão, usar o funil padrão
const funnelId = broadcastList?.crm_funnel_id || defaultFunnelId;
const stageId = broadcastList?.crm_funnel_stage_id || defaultFirstStageId;

// Na criação/atualização da conversa:
crm_funnel_id: funnelId,
funnel_stage: stageId,
```

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Adicionar `crm_funnel_id` e `crm_funnel_stage_id` |
| `src/types/whatsapp.ts` | Adicionar campos na interface |
| `src/pages/BroadcastDetails.tsx` | Adicionar seletores de Funil e Etapa |
| `supabase/functions/process-broadcast-queue/index.ts` | Usar funil/etapa da lista |

## Fluxo Final

```text
Usuário configura disparo:
  → Seleciona Responsável: "João Silva"
  → Seleciona Funil: "FUNIL POLÍTICA"  
  → Seleciona Etapa: "Interesse"
  → Clica "Iniciar Disparo"

Processamento (Edge Function):
  → Busca config: assigned_to, crm_funnel_id, crm_funnel_stage_id
  → Para cada lead que recebe mensagem:
     - crm_funnel_id = "FUNIL POLÍTICA"
     - funnel_stage = "Interesse"
     - assigned_to = "João Silva"

Resultado:
  → Lead aparece no Kanban "FUNIL POLÍTICA" na etapa "Interesse"
  → Lead está atribuído ao "João Silva"
```

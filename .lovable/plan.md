
## Plano: Adicionar Seleção de Funil e Etapa na Transferência

### Contexto
Atualmente, ao transferir uma conversa entre usuários, o modal `TransferUserModal` apenas permite selecionar o vendedor de destino. Você precisa também poder escolher o **funil** e a **etapa do funil** para onde o lead será movido.

---

### Alterações Propostas

#### 1. Modificar o `TransferUserModal.tsx`

**Adicionar novos estados:**
```typescript
const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
const [funnels, setFunnels] = useState<FunnelOption[]>([]);
const [stages, setStages] = useState<StageOption[]>([]);
```

**Adicionar tipos para funis e etapas:**
```typescript
interface FunnelOption {
  id: string;
  name: string;
  is_default: boolean;
}

interface StageOption {
  id: string;
  name: string;
  color: string;
}
```

**Adicionar função para carregar funis:**
```typescript
const loadFunnels = async () => {
  const { data } = await supabase
    .from('crm_funnels')
    .select('id, name, is_default')
    .order('is_default', { ascending: false });
  
  if (data) setFunnels(data);
};
```

**Adicionar função para carregar etapas quando funil muda:**
```typescript
const loadStages = async (funnelId: string) => {
  const { data } = await supabase
    .from('crm_funnel_stages')
    .select('id, name, color')
    .eq('funnel_id', funnelId)
    .order('stage_order');
  
  if (data) setStages(data);
};

// useEffect para reagir à mudança de funil
useEffect(() => {
  if (selectedFunnelId) {
    loadStages(selectedFunnelId);
    setSelectedStageId(null); // Limpa etapa ao mudar funil
  } else {
    setStages([]);
    setSelectedStageId(null);
  }
}, [selectedFunnelId]);
```

---

#### 2. Atualizar a Interface do Modal

Adicionar seções de seleção de funil e etapa após a seleção de usuário:

```tsx
{/* Seleção de Funil */}
<div className="space-y-2 pt-2 border-t">
  <Label className="flex items-center gap-2">
    <GitFork className="h-4 w-4" />
    Funil (opcional)
  </Label>
  <Select
    value={selectedFunnelId || 'keep'}
    onValueChange={(value) => setSelectedFunnelId(value === 'keep' ? null : value)}
  >
    <SelectTrigger>
      <SelectValue placeholder="Manter funil atual" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="keep">Manter funil atual</SelectItem>
      {funnels.map((funnel) => (
        <SelectItem key={funnel.id} value={funnel.id}>
          {funnel.name} {funnel.is_default && '(padrão)'}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>

{/* Seleção de Etapa */}
{selectedFunnelId && (
  <div className="space-y-2">
    <Label className="flex items-center gap-2">
      <GitBranch className="h-4 w-4" />
      Etapa do Funil
    </Label>
    {stages.length === 0 ? (
      <p className="text-sm text-muted-foreground">Carregando etapas...</p>
    ) : (
      <Select
        value={selectedStageId || ''}
        onValueChange={setSelectedStageId}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione a etapa" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              <div className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: stage.color }} 
                />
                {stage.name}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )}
  </div>
)}
```

---

#### 3. Atualizar a Lógica de Transferência

Modificar o objeto de update para incluir funil e etapa quando selecionados:

```typescript
const updateData: Record<string, unknown> = {
  assigned_to: selectedUserId,
  assigned_at: new Date().toISOString(),
  transferred_by: user.id,
};

// Adicionar funil e etapa se selecionados
if (selectedFunnelId) {
  updateData.crm_funnel_id = selectedFunnelId;
  if (selectedStageId) {
    updateData.funnel_stage = selectedStageId;
    updateData.funnel_stage_changed_at = new Date().toISOString();
  }
}

const { error: updateError } = await supabase
  .from('whatsapp_conversations')
  .update(updateData)
  .eq('id', conversationId);
```

---

#### 4. Carregar Funil/Etapa Atual ao Abrir Modal

Para mostrar ao usuário o funil/etapa atual do lead:

```typescript
const [currentFunnelId, setCurrentFunnelId] = useState<string | null>(null);
const [currentStageId, setCurrentStageId] = useState<string | null>(null);

// No loadUsers ou em useEffect separado:
const loadCurrentFunnelInfo = async () => {
  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('crm_funnel_id, funnel_stage')
    .eq('id', conversationId)
    .single();
    
  if (data) {
    setCurrentFunnelId(data.crm_funnel_id);
    setCurrentStageId(data.funnel_stage);
  }
};
```

---

### Imports Necessários

```typescript
import { GitFork, GitBranch } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

---

### Fluxo de Uso

```text
┌─────────────────────────────────────────┐
│       TRANSFERIR CONVERSA               │
├─────────────────────────────────────────┤
│                                         │
│  1️⃣ Selecione o vendedor               │
│  ┌─────────────────────────────────┐   │
│  │ ○ João Silva        [SDR]       │   │
│  │ ● Maria Santos      [Closer]    │   │
│  │ ○ Pedro Lima        [Admin]     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  2️⃣ Funil (opcional)                   │
│  ┌─────────────────────────────────┐   │
│  │ FUNIL POLÍTICA ▼                │   │
│  └─────────────────────────────────┘   │
│                                         │
│  3️⃣ Etapa do Funil                     │
│  ┌─────────────────────────────────┐   │
│  │ 🟢 Negociação       ▼           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ☐ Notificar o contato                 │
│                                         │
│        [Cancelar]  [Transferir]         │
└─────────────────────────────────────────┘
```

---

### Resultado Esperado

- Ao abrir o modal de transferência, o usuário verá:
  1. Lista de vendedores disponíveis
  2. Dropdown de funil (opcional - default "Manter funil atual")
  3. Dropdown de etapa (aparece quando um funil é selecionado)
  4. Checkbox de notificação
  
- Se nenhum funil for selecionado, apenas a atribuição do vendedor é alterada
- Se um funil for selecionado, a etapa é obrigatória antes de transferir
- Os campos `crm_funnel_id`, `funnel_stage` e `funnel_stage_changed_at` serão atualizados no banco

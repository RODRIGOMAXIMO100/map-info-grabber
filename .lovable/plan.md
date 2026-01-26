
## Plano: Adicionar Edição de Nome/Descrição do Funil

### Problema Identificado
O botão "Editar" (ícone de lápis) na página de Gerenciar Funis leva para a página de edição de **etapas**, mas não permite editar o **nome** ou **descrição** do próprio funil. Atualmente, essas informações só podem ser definidas na criação.

### Solução Proposta
Adicionar campos editáveis para nome e descrição do funil na página `FunnelStageEditor`, com um botão de salvar que atualiza a tabela `crm_funnels`.

---

### Alterações Necessárias

#### 1. Modificar `FunnelStageEditor.tsx`

**Adicionar estados para edição do funil:**
```typescript
const [funnelName, setFunnelName] = useState('');
const [funnelDescription, setFunnelDescription] = useState('');
```

**Inicializar os valores quando o funil carregar:**
```typescript
setFunnelName(funnelResult.data.name);
setFunnelDescription(funnelResult.data.description || '');
```

**Adicionar seção de edição do funil no topo da página:**
- Campo de Input para o nome do funil
- Campo de Textarea para a descrição (opcional)

**Modificar `handleSaveAll` para incluir update do funil:**
```typescript
await supabase
  .from('crm_funnels')
  .update({ 
    name: funnelName.trim(), 
    description: funnelDescription.trim() || null 
  })
  .eq('id', id);
```

---

### UI Proposta

```text
┌─────────────────────────────────────────────────────────┐
│ ← [Voltar]          Editar Funil         [💾 Salvar]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  📝 Informações do Funil                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Nome do Funil                                    │   │
│  │ [FUNIL AQUISIÇÃO___________________________]    │   │
│  │                                                  │   │
│  │ Descrição (opcional)                             │   │
│  │ [___________________________________________]   │   │
│  │ [___________________________________________]   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  📊 Etapas do Funil                                     │
│  [1] [🔵] [Novo_____________] [🤖 IA] [🗑️]             │
│  [2] [🟡] [Em Andamento_____] [👤 Manual] [🗑️]         │
│  [3] [🟢] [Fechado__________] [👤 Manual] [🗑️]         │
│                                                         │
│  [+ Adicionar Etapa]                                    │
└─────────────────────────────────────────────────────────┘
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/FunnelStageEditor.tsx` | Adicionar campos de edição de nome/descrição e incluir no save |

---

### Resultado Esperado

Após a implementação:
- O admin poderá editar o nome do funil diretamente na página de edição ✅
- O admin poderá editar/adicionar uma descrição ao funil ✅
- O botão "Salvar Alterações" salvará tanto as mudanças do funil quanto das etapas ✅
- A RLS já está configurada para permitir UPDATE por admins ✅

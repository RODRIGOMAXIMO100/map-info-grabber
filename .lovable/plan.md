

# Plano: Corrigir Criacao de Grupos de Cidades

## Problema Investigado

Analisei o codigo e identifiquei possiveis causas:

1. **O formulario de criacao pode estar conflitando** com o formulario pai da pagina de prospecao
2. **O estado nao esta sendo preservado** quando o usuario troca de aba
3. **Falta feedback visual** para orientar o usuario no fluxo correto

---

## Solucao Proposta

### 1. Adicionar Logs de Debug Temporarios

Adicionar `console.log` para verificar se as funcoes estao sendo chamadas corretamente:

```typescript
// Em RegionGroupSelector.tsx
const handleCreateGroup = () => {
  console.log('handleCreateGroup chamado');
  console.log('currentLocations:', currentLocations);
  console.log('newGroupName:', newGroupName);
  // ... resto do codigo
};
```

### 2. Prevenir Submit do Form Pai

Adicionar `e.preventDefault()` e `e.stopPropagation()` no handler do Enter:

```typescript
// Linha 157 de RegionGroupSelector.tsx
onKeyDown={(e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    handleCreateGroup();
  }
}}
```

### 3. Adicionar Feedback Visual Melhor

Melhorar a mensagem quando nao ha cidades selecionadas:

```typescript
// Na area de criacao de grupo
{isCreating && currentLocations.length === 0 && (
  <div className="text-xs text-amber-600 mt-2">
    Adicione cidades nas abas "Uma cidade" ou "Varias cidades" primeiro
  </div>
)}
```

### 4. Verificar Persistencia do LocalStorage

Garantir que o localStorage esta funcionando no ambiente:

```typescript
// Em regionGroups.ts - adicionar log
export function saveRegionGroup(name: string, locations: Location[]): RegionGroup {
  console.log('saveRegionGroup chamado', { name, locations });
  const groups = getRegionGroups();
  // ... resto
  console.log('Grupo salvo no localStorage');
  return newGroup;
}
```

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/components/prospecting/RegionGroupSelector.tsx` | Prevenir propagacao de eventos, melhorar feedback |
| `src/lib/regionGroups.ts` | Adicionar logs de debug |

---

## Fluxo Correto para Criar Grupos

O usuario precisa seguir este fluxo:

```text
1. Aba "Uma cidade" ou "Varias cidades"
   -> Adicionar cidades (ex: Vicosa, Uba, Muriae)
   -> Cidades aparecem na area abaixo das abas

2. Aba "Grupos"
   -> Clicar em "Novo Grupo"
   -> Digitar nome (ex: "Zona da Mata MG")
   -> Clicar no botao de confirmar (check)

3. Grupo criado e salvo no localStorage
   -> Aparece na lista de grupos salvos
```

---

## Teste Sugerido

Apos as correcoes, pedir ao usuario para:

1. Abrir o Console do navegador (F12)
2. Adicionar 2-3 cidades na aba "Uma cidade"
3. Ir para aba "Grupos"
4. Clicar em "Novo Grupo"
5. Digitar um nome e confirmar
6. Verificar os logs no console

---

## Resultado Esperado

- Logs no console mostrarao o fluxo de execucao
- O grupo sera criado e aparecera na lista
- Se houver erro, o log indicara onde esta o problema


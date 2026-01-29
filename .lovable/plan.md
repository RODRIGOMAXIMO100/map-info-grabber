
# Plano: Corrigir Grupos de Cidades Zerando Apos Salvar

## Problema Identificado

Quando o usuario cria um grupo de cidades e depois salva, as cidades do grupo estao "zerando" (ficando com array vazio).

## Diagnostico

Analisando o codigo, identifiquei o problema na funcao `saveRegionGroup` em `src/lib/regionGroups.ts`:

```typescript
const newGroup: RegionGroup = {
  id: generateId(),
  name: name.trim(),
  locations,  // ⬅️ PROBLEMA: Referencia direta ao array
  createdAt: now,
  updatedAt: now,
};
```

### Causa Raiz

1. O array `locations` e passado por **referencia** do componente pai (`Index.tsx`)
2. Quando o grupo e criado, ele salva essa referencia diretamente
3. Embora `JSON.stringify` crie uma copia ao salvar no localStorage, o objeto `newGroup` retornado mantem a referencia original
4. Quando o usuario limpa as cidades ou modifica a selecao, o array original muda
5. Na proxima vez que `setGroups([...groups, newGroup])` executa ou quando o componente re-renderiza, o grupo mostra o array modificado (vazio)

### Fluxo do Bug

```text
1. Usuario adiciona 10 cidades
2. Usuario vai para aba "Grupos"
3. Usuario cria grupo "Minha Regiao" → salva no localStorage ✓
4. Usuario clica "Limpar todas" na area de cidades selecionadas
5. O array `locations` original fica vazio → []
6. O estado React do RegionGroupSelector ainda tem referencia ao mesmo array
7. O grupo aparece com 0 cidades na interface
8. Nota: O localStorage ainda tem os dados corretos! Mas o estado React nao
```

## Solucao

### Arquivo: `src/lib/regionGroups.ts`

Fazer uma copia profunda do array de locations antes de salvar:

```typescript
export function saveRegionGroup(name: string, locations: Location[]): RegionGroup {
  console.log('[regionGroups] saveRegionGroup chamado', { name, locationsCount: locations.length });
  
  const groups = getRegionGroups();
  const now = new Date().toISOString();
  
  // CORRECAO: Criar copia profunda das locations
  const locationsCopy = locations.map(loc => ({ ...loc }));
  
  const newGroup: RegionGroup = {
    id: generateId(),
    name: name.trim(),
    locations: locationsCopy,  // Usar a copia, nao a referencia
    createdAt: now,
    updatedAt: now,
  };
  
  groups.push(newGroup);
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    console.log('[regionGroups] Grupo salvo no localStorage com sucesso:', newGroup.id);
  } catch (error) {
    console.error('[regionGroups] Erro ao salvar no localStorage:', error);
  }
  
  return newGroup;
}
```

### Arquivo: `src/components/prospecting/RegionGroupSelector.tsx`

Adicionar um listener para recarregar grupos quando necessario e garantir sincronizacao:

```typescript
// Adicionar sincronizacao com localStorage quando a aba fica visivel
useEffect(() => {
  // Recarregar grupos do localStorage sempre que o componente montar
  // ou quando currentLocations mudar (para garantir sincronizacao)
  const storedGroups = getRegionGroups();
  setGroups(storedGroups);
}, []);

// Opcional: Adicionar evento de storage para sincronizar entre abas
useEffect(() => {
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'prospecting_region_groups') {
      setGroups(getRegionGroups());
    }
  };
  window.addEventListener('storage', handleStorageChange);
  return () => window.removeEventListener('storage', handleStorageChange);
}, []);
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/regionGroups.ts` | Fazer copia profunda do array locations antes de salvar |
| `src/components/prospecting/RegionGroupSelector.tsx` | Melhorar sincronizacao do estado com localStorage |

## Resultado Esperado

1. Grupos de cidades sao salvos com copias independentes das localizacoes
2. Limpar a selecao de cidades nao afeta grupos ja salvos
3. Os grupos permanecem com as cidades corretas mesmo apos recarregar a pagina ou mudar de aba

## Teste de Verificacao

1. Adicionar 5+ cidades
2. Ir para aba "Grupos"
3. Criar um grupo com nome "Teste"
4. Verificar que mostra "5 cidades" no grupo
5. Clicar em "Limpar todas" na area de cidades selecionadas
6. O grupo "Teste" deve continuar mostrando "5 cidades"
7. Recarregar a pagina e verificar que o grupo ainda tem as cidades

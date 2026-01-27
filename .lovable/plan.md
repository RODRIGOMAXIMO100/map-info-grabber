
# Plano: Corrigir Enriquecimento de Instagram na Prospecção

## Problema Identificado

O sistema usa cache de 7 dias para economizar créditos de API. Quando você pesquisou com "Enriquecer dados" ativado, os resultados vieram do cache de uma pesquisa anterior que foi feita **sem** enriquecimento.

Os dados no cache já mostram que 7 de 10 pizzarias têm website, mas nenhuma tem Instagram porque o Firecrawl nunca foi chamado.

---

## Solução Proposta

### Opção Escolhida: Cache Key Separado para Enriquecimento

Criar uma cache key diferente quando o enriquecimento está ativado, assim:
- `serper_pizzaria_viçosa_MG_100` → Busca básica (sem enriquecer)
- `serper_pizzaria_viçosa_MG_100_enriched` → Busca com enriquecimento

Isso garante que:
1. Pesquisas básicas continuam rápidas (cache funciona normal)
2. Pesquisas com enriquecimento sempre rodam o Firecrawl
3. Resultados enriquecidos são salvos separadamente no cache

---

## Alterações Necessárias

### 1. Modificar geração de cache key (useBusinessSearch.ts)

Adicionar parâmetro de enriquecimento na função `generateCacheKey`:

```typescript
function generateCacheKey(keyword: string, city: string, state: string, maxResults: number, enriched: boolean): string {
  const suffix = enriched ? '_enriched' : '';
  return `serper_${keyword.toLowerCase().trim()}_${city.toLowerCase()}_${state}_${maxResults}${suffix}`;
}
```

### 2. Atualizar chamadas de cache

Passar o parâmetro `useEnrichment` para todas as chamadas que geram ou consultam cache.

### 3. Limpar cache antigo (opcional)

Sugerir ao usuário limpar o cache para forçar nova busca com enriquecimento.

---

## Fluxo Corrigido

```text
Usuário ativa "Enriquecer dados" ✓
       ↓
Gera cache key: "serper_pizzaria_viçosa_MG_100_enriched"
       ↓
Cache não encontrado (key diferente)
       ↓
Serper busca 10 resultados
       ↓
Firecrawl enriquece 7 com website
       ↓
Retorna com Instagram/Email preenchidos
       ↓
Salva no cache com key "_enriched"
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useBusinessSearch.ts` | Atualizar `generateCacheKey()` e chamadas |

---

## Resultado Esperado

- Próxima pesquisa com enriquecimento vai ignorar cache antigo
- Firecrawl será chamado para scrape dos websites
- Instagram e Email serão extraídos e exibidos nos resultados

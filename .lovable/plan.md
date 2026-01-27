
## Plano: Corrigir Erros e Limpar Prospecção

### Problema Principal Identificado

Os logs do PostgreSQL mostram erros repetidos:
```
"new row for relation \"search_cache\" violates check constraint \"search_cache_search_type_check\""
```

**Causa:** A constraint na tabela `search_cache` só permite os valores `'google_maps'` ou `'instagram'` para o campo `search_type`. Porém, o código em `useBusinessSearch.ts` (linha 257) está tentando inserir `search_type: 'serper'`, que viola essa constraint.

---

### Alterações Necessárias

#### 1. Migração SQL - Corrigir Constraint

Atualizar a constraint para aceitar `'google_maps'`, que é o valor correto para buscas via Serper (pois os resultados vêm do Google Maps):

```sql
-- Remover constraint antiga
ALTER TABLE public.search_cache 
DROP CONSTRAINT IF EXISTS search_cache_search_type_check;

-- Adicionar constraint corrigida (google_maps e instagram)
ALTER TABLE public.search_cache 
ADD CONSTRAINT search_cache_search_type_check 
CHECK (search_type IN ('google_maps', 'instagram'));

-- Limpar entradas inválidas do cache (se houver)
DELETE FROM public.search_cache 
WHERE search_type NOT IN ('google_maps', 'instagram');
```

#### 2. Corrigir `useBusinessSearch.ts`

Mudar `search_type: 'serper'` para `search_type: 'google_maps'`:

```typescript
// Linha 257 - ANTES:
search_type: 'serper',

// DEPOIS:
search_type: 'google_maps',
```

#### 3. Melhorias Adicionais no Hook

**Tratar erro silencioso no cache insert:**
O `.then()` na linha 264 não trata erros do insert. Melhorar para:
```typescript
supabase.from('search_cache').insert({...})
  .then(({ error }) => {
    if (error) {
      console.error(`[Cache] Erro ao salvar ${location.city}:`, error.message);
    } else {
      console.log(`[Cache] Salvo ${location.city} (${locationResults.length})`);
    }
  });
```

#### 4. Limpeza no `Index.tsx`

**4.1 Remover console.logs excessivos:**
- Linha 63: `console.log(`Loaded ${parsed.length} persisted results`);` → Remover
- Manter apenas logs de erro

**4.2 Melhorar mensagem de erro:**
Atualmente, erros são mostrados em um Card vermelho simples. Adicionar mais contexto:
```typescript
{error && (
  <Card className="border-destructive bg-destructive/5">
    <CardContent className="pt-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <div>
          <p className="font-medium text-destructive">Erro na busca</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

**4.3 Limpar cache corretamente:**
A função `clearDatabaseCache` (linha 113-133) usa uma lógica estranha que deleta entradas com expire menor que 1 ano no futuro. Simplificar:
```typescript
const { error } = await supabase
  .from('search_cache')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
```

#### 5. Melhorias no Edge Function `search-businesses-serpapi`

**5.1 Adicionar tratamento para erro 500:**
```typescript
if (response.status >= 500) {
  console.error(`[Serper] Server error for ${location.city}`);
  continue; // Skip this city, try next
}
```

**5.2 Adicionar timeout:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

const response = await fetch('https://google.serper.dev/places', {
  // ... options
  signal: controller.signal,
});
clearTimeout(timeout);
```

---

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Migração SQL | Recriar constraint com valores corretos |
| `src/hooks/useBusinessSearch.ts` | Corrigir `search_type` de 'serper' → 'google_maps', melhorar error handling |
| `src/pages/Index.tsx` | Limpar console.logs, melhorar UI de erro, corrigir clearDatabaseCache |
| `supabase/functions/search-businesses-serpapi/index.ts` | Adicionar timeout e melhor error handling |

---

### Resultado Esperado

Após as correções:
- Cache de busca funcionará corretamente (sem erros de constraint)
- Buscas repetidas serão mais rápidas (cache funcionando)
- Erros serão exibidos de forma mais clara ao usuário
- Logs mais limpos no console do navegador
- Maior resiliência a falhas temporárias da API Serper


## Plano: Simplificar Prospecção - Apenas Google Maps

### O que será removido

1. **Busca por Instagram** - Remover completamente a funcionalidade de pesquisa de perfis do Instagram
2. **Aba "Estado inteiro"** - Remover pois não funciona bem (só tem 10-30 cidades por estado)
3. **Seletor de fonte** (Maps / Instagram / Ambos) - Não será mais necessário

### O que será adicionado

1. **Upload de CSV/TXT** - Permitir subir arquivo com lista de cidades
2. **Indicador de fonte mais claro** - Mudar badge de "Maps" para "Google"

---

### Arquivos a Modificar

#### 1. `src/pages/Index.tsx`

Remover toda lógica do Instagram:

```typescript
// REMOVER:
- import { useInstagramSearch, InstagramResult } from '@/hooks/useInstagramSearch';
- type SearchSource = 'maps' | 'instagram' | 'both';
- const [searchSource, setSearchSource] = useState<SearchSource>('both');
- const { search: searchInstagram, ... } = useInstagramSearch();
- Toda lógica de conversão de resultados Instagram
- Tabs de seleção de fonte (Maps/Instagram/Ambos)
- Referências a instagramLoading, instagramProgress, isScraping
- Estatística "fromInstagram"
```

Simplificar cálculos:

```typescript
// Antes:
const estimatedLeads = locations.length * maxResultsPerCity * sources;

// Depois:
const estimatedLeads = locations.length * maxResultsPerCity;
```

Simplificar busca:

```typescript
// Antes:
const promises: Promise<void>[] = [];
if (searchSource === 'maps' || searchSource === 'both') { ... }
if (searchSource === 'instagram' || searchSource === 'both') { ... }

// Depois:
await searchMaps(keyword, locations, maxResultsPerCity, totalMaxResults, useEnrichment);
```

#### 2. `src/components/LocationSelector.tsx`

Remover aba "Estado inteiro" e adicionar upload de arquivo:

```typescript
// Remover TabsTrigger "state" e TabsContent "state"

// Adicionar na aba "multiple":
<div className="space-y-3 mt-3">
  <Textarea ... />
  
  {/* Novo: Upload de arquivo */}
  <div className="flex items-center gap-2">
    <input
      type="file"
      accept=".csv,.txt"
      onChange={handleFileUpload}
      className="hidden"
      id="city-file-upload"
    />
    <Label 
      htmlFor="city-file-upload" 
      className="cursor-pointer flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-muted"
    >
      <Upload className="h-4 w-4" />
      Importar CSV/TXT
    </Label>
  </div>
</div>
```

Lógica do upload:

```typescript
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    const lines = text.split(/[\r\n]+/).filter(l => l.trim());
    
    let added = 0;
    lines.forEach(line => {
      const parts = line.split(/[,;]/).map(p => p.trim());
      if (parts.length >= 2 && parts[1].length === 2) {
        // Formato: cidade, UF
        onAdd({ city: parts[0], state: parts[1].toUpperCase() });
        added++;
      } else if (bulkState && parts[0]) {
        // Apenas cidade, usa estado selecionado
        onAdd({ city: parts[0], state: bulkState });
        added++;
      }
    });
    
    toast({
      title: 'Cidades importadas',
      description: `${added} cidades adicionadas do arquivo.`,
    });
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset input
};
```

#### 3. `src/components/ResultsTable.tsx`

Mudar badge de fonte para maior clareza:

```typescript
// Antes:
{business.source === 'google_maps' ? (
  <><Map className="h-3 w-3" /> Maps</>
) : (
  <><Instagram className="h-3 w-3" /> IG</>
)}

// Depois:
{business.source === 'google_maps' && (
  <><Map className="h-3 w-3" /> Google</>
)}
```

#### 4. Arquivos que podem ser deletados (opcional)

Estes arquivos não serão mais usados pela prospecção:

| Arquivo | Motivo |
|---------|--------|
| `src/hooks/useInstagramSearch.ts` | Hook de busca do Instagram |
| `supabase/functions/search-instagram/index.ts` | Edge function de busca IG |
| `supabase/functions/scrape-whatsapp/index.ts` | Scraping de perfis IG |

**Nota:** Podemos manter esses arquivos por enquanto caso você queira reativar no futuro.

---

### Interface Final

**Antes (3 abas + seletor de fonte):**
```
[Uma cidade] [Várias cidades] [Estado inteiro]

Fontes: [Google Maps] [Instagram] [Ambos]
```

**Depois (2 abas, simples):**
```
[Uma cidade] [Várias cidades]

Cole as cidades ou importe um arquivo CSV/TXT
[📎 Importar CSV/TXT]
```

---

### Resultado

- Interface mais limpa e direta
- Sem confusão sobre fontes de busca
- Permite subir centenas de cidades de uma vez
- Remove código não utilizado
- Mantém apenas a busca que funciona (Google Maps via Serper)

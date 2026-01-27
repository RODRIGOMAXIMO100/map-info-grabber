
# Plano: Corrigir Extração de Instagram + Grupos de Regiões

## Diagnóstico do Problema com Instagram

Analisando os logs da ultima busca:

| Empresa | Website | Resultado |
|---------|---------|-----------|
| Doce Sonho | zapesite.com.br/doce-sonho | Instagram encontrado |
| Cantinho dos Sonhos | instagram.com/cantinhodossonhos_vicosa | Erro 403 (bloqueado) |

### Causa Raiz

1. **Funciona corretamente** quando o site e um dominio proprio - Firecrawl consegue scrape
2. **Falha** quando o "website" e uma URL do Instagram - o Firecrawl nao consegue acessar Instagram diretamente (retorna 403)
3. **Das 10 empresas encontradas**, apenas 2 tinham website para enriquecer
4. Das 2, 1 era link direto do Instagram (que falha)

### Solucao: Detectar URLs de Instagram antes de tentar scrape

Modificar o edge function `enrich-business` para:
1. Identificar se o website ja e um link do Instagram
2. Se for, extrair o username diretamente da URL (sem chamar Firecrawl)
3. Economiza creditos e evita erros 403

---

## Nova Feature: Grupos de Regioes

### O que e

O usuario podera criar e salvar colecoes de cidades com um nome, exemplo:
- "Zona da Mata MG" = Vicosa, Uba, Muriae, Cataguases
- "Interior SP" = Campinas, Ribeirao Preto, Sorocaba, etc

### Armazenamento

**Opcao 1**: LocalStorage (mais simples, sem banco)
- Prós: Rapido de implementar, funciona offline
- Contras: Perdido se trocar de navegador/limpar dados

**Opcao 2**: Tabela no banco (recomendado para persistencia)
- Prós: Dados salvos permanentemente, sincroniza entre dispositivos
- Contras: Requer migracao

**Recomendado**: LocalStorage primeiro (implementacao rapida), com opcao futura de migrar para banco.

### Interface

```text
+------------------------------------------+
| [Grupos Salvos]          [+ Novo Grupo]  |
+------------------------------------------+
| Zona da Mata MG (5 cidades)    [Usar]    |
| Interior SP (8 cidades)        [Usar]    |
| Grande BH (12 cidades)         [Usar]    |
+------------------------------------------+
```

Botoes:
- **Usar**: Carrega todas as cidades do grupo no seletor
- **Editar**: Permite adicionar/remover cidades
- **Excluir**: Remove o grupo

### Fluxo de Criacao

1. Usuario adiciona cidades no seletor normalmente
2. Clica em "Salvar como Grupo"
3. Digita um nome (ex: "Zona da Mata MG")
4. Grupo e salvo e aparece na lista

---

## Alteracoes Necessarias

### 1. Edge Function enrich-business (Instagram fix)

Adicionar deteccao de URL do Instagram antes de tentar Firecrawl:

```typescript
// Detectar se website ja e Instagram
function extractInstagramFromUrl(url: string): string {
  const match = url.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
  if (match && match[1]) {
    return `https://instagram.com/${match[1]}`;
  }
  return '';
}

// No loop de enriquecimento:
if (business.website) {
  // Checar se o proprio website e um link do Instagram
  const directInstagram = extractInstagramFromUrl(business.website);
  if (directInstagram) {
    enriched.instagram = directInstagram;
    // NAO chamar Firecrawl, economiza creditos
  } else if (FIRECRAWL_API_KEY && useFirecrawl) {
    // Scrape normal com Firecrawl
  }
}
```

### 2. Novo Componente: RegionGroupSelector

| Arquivo | Descricao |
|---------|-----------|
| `src/components/prospecting/RegionGroupSelector.tsx` | Componente para listar/criar/usar grupos |

### 3. Integrar no LocationSelector

Adicionar nova aba "Grupos Salvos" no TabsList do LocationSelector.

### 4. LocalStorage Helper

| Arquivo | Descricao |
|---------|-----------|
| `src/lib/regionGroups.ts` | Funcoes para salvar/carregar/deletar grupos |

---

## Arquivos a Modificar/Criar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `supabase/functions/enrich-business/index.ts` | Modificar | Detectar Instagram em URLs |
| `src/components/prospecting/RegionGroupSelector.tsx` | Criar | Componente de grupos |
| `src/lib/regionGroups.ts` | Criar | Helpers de localStorage |
| `src/components/LocationSelector.tsx` | Modificar | Adicionar aba de grupos |

---

## Resultado Esperado

### Instagram Fix
- URLs do Instagram serao detectadas automaticamente
- Economiza creditos Firecrawl
- Elimina erros 403

### Grupos de Regioes
- Usuario cria grupo "Zona da Mata MG" com 5 cidades
- Proxima vez, clica em "Usar" e todas as 5 cidades sao carregadas
- Nao precisa mais digitar cidade por cidade

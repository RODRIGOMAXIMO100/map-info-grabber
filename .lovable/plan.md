

# Plano: Melhoria Total da Prospecção

## Visão Geral das Melhorias

Após análise completa do código, identifiquei **7 áreas principais** para transformar a prospecção em uma ferramenta mais eficiente, robusta e profissional.

---

## 1. Interface Mais Limpa e Intuitiva

### Problemas Atuais
- Muitos filtros visíveis o tempo todo (poluição visual)
- Formulário grande demais com muitas opções
- Não há separação clara entre "configurar busca" e "ver resultados"

### Melhorias
- **Wizard em 3 passos**: Palavra-chave → Cidades → Opções → Buscar
- **Filtros colapsáveis**: Esconder filtros avançados em um accordion
- **Preview antes de buscar**: Card resumo com estimativa de tempo e créditos

```
Passo 1: O que buscar?     [Pizzarias        ▾]
Passo 2: Onde?             [3 cidades selecionadas] [+]
Passo 3: Opções            [▾ Mostrar opções avançadas]
                           [🔍 Buscar ~60 leads]
```

---

## 2. Histórico e Favoritos de Buscas

### Novo recurso
Salvar buscas frequentes para reutilização rápida:

- **Histórico automático**: Últimas 10 buscas realizadas
- **Favoritos**: Salvar combinações de palavra-chave + cidades
- **Reutilização**: Clicar para preencher formulário automaticamente

### Estrutura no localStorage
```typescript
interface SavedSearch {
  id: string;
  keyword: string;
  locations: Location[];
  createdAt: string;
  resultCount: number;
  isFavorite: boolean;
}
```

### UI
```
┌─────────────────────────────────────────────────┐
│ 📋 Buscas recentes                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ ⭐ Pizzarias em SP (45 leads) - há 2 dias   │ │
│ │    Dentistas em RJ (32 leads) - há 5 dias   │ │
│ │    Academias em MG (28 leads) - há 1 semana │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 3. Validação de Telefones em Tempo Real

### Problema
Muitos resultados têm telefones inválidos ou fixos que não servem para WhatsApp.

### Solução
- Validar formato do telefone brasileiro (DDD + 9 dígitos para celular)
- Indicar visualmente se é celular ou fixo
- Opção de filtrar apenas celulares confirmados

### Lógica de validação
```typescript
function validateBrazilianPhone(phone: string): {
  isValid: boolean;
  isMobile: boolean;
  formattedNumber: string;
  ddd: string;
} {
  const digits = phone.replace(/\D/g, '');
  // DDD (2 dígitos) + número (8-9 dígitos)
  // Celular começa com 9 após o DDD
  const isMobile = digits.length >= 10 && digits[2] === '9';
  // ...
}
```

### Badge visual
- 📱 Celular confirmado (verde)
- ☎️ Fixo/indefinido (cinza)

---

## 4. Melhorias na Tabela de Resultados

### Visualização em Lista vs Grid
Adicionar toggle para alternar entre:
- **Grid (atual)**: Cards visuais, bom para poucos resultados
- **Lista/Tabela**: Compacta, melhor para exportar/selecionar em massa

### Ordenação múltipla
Permitir ordenar por:
- Score de qualidade (padrão)
- Nome A-Z
- Cidade
- Avaliação (estrelas)
- Quantidade de canais de contato

### Seleção inteligente
- **Selecionar por critério**: "Todos com WhatsApp", "Todos de SP", "Score 4+"
- **Inversão de seleção**: Selecionar todos exceto X
- **Contagem em tempo real**: "42 de 128 selecionados"

---

## 5. Exportação Avançada

### Formatos adicionais
- **CSV** (atual)
- **Excel (.xlsx)**: Com formatação e cores
- **Colar no WhatsApp**: Lista de números separados por vírgula
- **Google Sheets**: Link direto (via API futura)

### Exportação parcial
- Exportar apenas selecionados
- Exportar por filtro ativo
- Escolher colunas a exportar

### Template para WhatsApp Web
```
Gerar lista formatada:
5511999887766
5511888776655
5521977665544
...
```

---

## 6. Dashboard de Estatísticas

### Métricas da busca atual
```
┌───────────────────────────────────────────────────────┐
│  📊 Resumo da Busca                                    │
├───────────┬───────────┬───────────┬─────────────────┤
│  128      │  67       │  23       │  15            │
│  Total    │  WhatsApp │  Email    │  Alta Qual.    │
│           │  (52%)    │  (18%)    │  (12%)         │
├───────────┴───────────┴───────────┴─────────────────┤
│  ⏱️ Tempo: 45s  |  💾 Cache: 3  |  🔍 API: 5      │
└───────────────────────────────────────────────────────┘
```

### Gráfico de distribuição
- Por cidade
- Por qualidade
- Por canal de contato

---

## 7. Performance e Confiabilidade

### Cache inteligente
- Mostrar idade do cache: "Dados de há 3 dias"
- Opção de forçar busca fresca por cidade
- Cache seletivo: "Usar cache para SP, buscar novo para RJ"

### Retry automático
```typescript
// Se uma cidade falhar, tentar novamente até 2x com backoff
const MAX_RETRIES = 2;
const RETRY_DELAY = [1000, 3000]; // 1s, 3s

async function fetchWithRetry(location: Location) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await searchLocation(location);
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY[attempt]);
        continue;
      }
      throw err;
    }
  }
}
```

### Indicador de saúde da API
- Badge verde/amarelo/vermelho mostrando status do Serper
- Aviso quando créditos estiverem baixos (se API retornar essa info)

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/pages/Index.tsx` | Refatorar para wizard, adicionar histórico, dashboard de stats |
| `src/components/LocationSelector.tsx` | Preview de cidades no upload, melhorias UX |
| `src/components/ResultsTable.tsx` | Modo lista, ordenação, seleção inteligente |
| `src/hooks/useBusinessSearch.ts` | Retry automático, validação de telefones |
| `src/lib/exportCsv.ts` | Exportação para Excel, formato WhatsApp |
| `src/lib/phoneValidation.ts` | **Novo** - Validação de telefones BR |
| `src/components/SearchHistory.tsx` | **Novo** - Histórico e favoritos |
| `src/components/SearchStats.tsx` | **Novo** - Dashboard de estatísticas |

---

## Priorização Sugerida

### Fase 1 - Quick Wins (1-2 horas)
1. Validação de telefones + badge celular/fixo
2. Modo lista na tabela de resultados
3. Ordenação por múltiplos critérios

### Fase 2 - UX Melhorada (2-3 horas)
4. Histórico de buscas no localStorage
5. Dashboard de estatísticas da busca
6. Filtros colapsáveis

### Fase 3 - Funcionalidades Avançadas (3-4 horas)
7. Retry automático com backoff
8. Exportação para Excel e formato WhatsApp
9. Wizard de busca em passos

---

## Resultado Final

**Antes:**
- Interface confusa com muitas opções
- Sem histórico de buscas
- Telefones não validados
- Apenas exportação CSV básica

**Depois:**
- Interface limpa e organizada em passos
- Histórico e favoritos para reutilização
- Validação de telefones com badge visual
- Múltiplos formatos de exportação
- Dashboard de estatísticas
- Maior confiabilidade com retry automático


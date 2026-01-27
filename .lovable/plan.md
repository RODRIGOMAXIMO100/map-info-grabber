
# Plano: Corrigir Dados Zerados na Pagina de Equipe

## Problema Identificado

A pagina de desempenho da equipe mostra todos os dados zerados porque a query de mensagens esta filtrando pelo valor errado.

| Valor na Query | Valor no Banco |
|----------------|----------------|
| `'out'` | `'outgoing'` |

A query busca por `direction = 'out'` mas o banco armazena `'outgoing'`. Resultado: **zero mensagens encontradas**.

## Evidencias do Banco

```text
Mensagens existentes:
- 923 mensagens 'outgoing'
- 1917 mensagens 'incoming'

Mensagens encontradas pela query atual:
- 0 mensagens (porque busca por 'out')
```

## Problema Secundario: sent_by_user_id

Todas as mensagens enviadas tem `sent_by_user_id = NULL`. Isso acontece porque a edge function `whatsapp-send-message` nao recebe nem salva o ID do usuario que enviou. O codigo atual usa um fallback para `assigned_to` da conversa, o que funciona, mas nao e preciso.

---

## Solucao

### 1. Corrigir Filtro de Direction (Correcao Principal)

Alterar as duas queries em `TeamPerformance.tsx` de:

```typescript
.eq('direction', 'out')
```

Para:

```typescript
.eq('direction', 'outgoing')
```

**Linhas afetadas**: 139 e 147

### 2. (Opcional) Rastrear sent_by_user_id

Para metricas mais precisas no futuro, podemos:
- Passar o `user_id` do frontend para a edge function `whatsapp-send-message`
- Salvar na coluna `sent_by_user_id` da mensagem

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `src/pages/TeamPerformance.tsx` | Trocar `'out'` por `'outgoing'` nas linhas 139 e 147 |

---

## Impacto Esperado

Apos a correcao:
- 923 mensagens serao encontradas
- Metricas de mensagens, tempo ativo e conversas aparecerao corretamente
- Ranking de vendedores funcionara

---

## Correcao Simples

A correcao e uma mudanca de duas linhas:

```typescript
// Linha 139: Query de mensagens no periodo
.eq('direction', 'outgoing')  // era 'out'

// Linha 147: Query de mensagens de hoje
.eq('direction', 'outgoing')  // era 'out'
```

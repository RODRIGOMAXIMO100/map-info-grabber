
# Plano: Corrigir Nome do Contato Sendo Sobrescrito

## Problema Identificado

Quando o sistema envia mensagens, a UAZAPI retorna dados onde `senderName` e o nome em `payload.chat` referem-se à **instância que enviou**, não ao contato de destino.

**Exemplo do log:**
```json
{
  "chatid": "553199486648@s.whatsapp.net",  // Victor (contato)
  "senderName": "Grazi",                      // Instância (ERRADO!)
}
```

**Código problemático (linha 638-644):**
```typescript
} else if (!isGroup && senderName) {
  updateData.name = senderName;  // Sobrescreve nome do contato com nome da instância
}
```

Isso faz com que todos os contatos tenham o nome da instância ("Grazi") salvo.

---

## Solucao

### Nao Atualizar Nome Quando Mensagem e Nossa (isFromMe)

Adicionar verificacao para nao atualizar o nome do contato quando a mensagem foi enviada pelo sistema.

```typescript
// ANTES (incorreto)
} else if (!isGroup && senderName) {
  updateData.name = senderName;
}

// DEPOIS (correto)
} else if (!isGroup && senderName && !isFromMe) {
  // Só atualiza nome quando mensagem vem DO CONTATO, não nossa
  updateData.name = senderName;
}
```

### Correcao Similar na Criacao de Novas Conversas

Ao criar conversas novas a partir de mensagens nossas, nao usar o senderName (que sera da instancia).

---

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/whatsapp-receive-webhook/index.ts` | Linhas 638-644 e criacao de conversa |

---

## Logica Corrigida

```text
Mensagem chegou
       |
       +-- isFromMe = true (nossa mensagem)
       |        |
       |        +-- NAO atualizar nome
       |        +-- senderName = nome da instancia (ignorar)
       |
       +-- isFromMe = false (mensagem do contato)
                |
                +-- Atualizar nome com senderName
                +-- senderName = nome real do contato
```

---

## Bonus: Corrigir Nomes Errados Existentes

Apos o deploy, posso rodar uma query para limpar os nomes "Grazi" que foram salvos incorretamente, identificando conversas onde o nome esta errado.

---

## Resultado Esperado

- Mensagens enviadas pelo sistema nao sobrescrevem o nome do contato
- Nomes dos contatos sao atualizados apenas quando ELES enviam mensagens
- Contatos mantem seus nomes corretos (Victor, etc.)



# Plano: Corrigir Todos os Nomes Errados em Produção

## Problema

Existem **6 conversas** onde o nome do contato foi sobrescrito com "Grazi" (nome do perfil WhatsApp da instância de prospecção).

## Conversas Afetadas

| Telefone | ID Conversa | Status |
|----------|-------------|--------|
| 553199936060 | 10c88770-6504-4577-a533-22965eedc2cd | active |
| 553199651487 | b896e5f2-58b5-4b83-bc70-b241d4217da6 | active |
| 553298212506 | b6a80995-8ea1-4b05-a51b-ea6d065c2bf9 | active |
| 553180213483 | 66483027-230e-4f21-944f-e242aa08edf8 | active |
| 553196458273 | f1d42a13-afd2-4c2f-94b8-44db9b71d0ed | active |
| 553299731207 | 3d951bc7-eee6-4bab-a410-9150f7868c95 | active |

## Solucao

Executar uma query UPDATE para resetar o nome dessas conversas para NULL. Quando cada contato enviar uma nova mensagem, o nome correto sera atualizado automaticamente pelo webhook (agora corrigido).

```sql
UPDATE whatsapp_conversations 
SET name = NULL, updated_at = NOW()
WHERE name ILIKE '%grazi%' OR name ILIKE '%grazy%';
```

## Resultado Esperado

- 6 conversas terao o nome resetado para NULL
- O webhook corrigido garantira que futuros nomes sejam salvos corretamente
- Quando cada contato enviar mensagem, o nome real aparecera

---

## Detalhes Tecnicos

A correção do webhook (ja aplicada) previne este problema para novas mensagens. Esta limpeza resolve os registros historicos afetados.


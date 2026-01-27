

# Plano: Limpar CRM e Chat do Luiz Otavio

## Resumo dos Dados a Serem Afetados

| Item | Quantidade |
|------|------------|
| Conversas atribuídas ao Luiz | **239** |
| Total de mensagens nessas conversas | **2.399** |
| Usuário | LUIZ OTAVIO (Closer) |
| User ID | `8c2d85a0-2390-4ee0-b108-82661d0b6057` |

---

## Ação Proposta

Executar as seguintes operações no banco de dados:

### 1. Deletar todas as mensagens das conversas do Luiz

```sql
DELETE FROM whatsapp_messages 
WHERE conversation_id IN (
  SELECT id FROM whatsapp_conversations 
  WHERE assigned_to = '8c2d85a0-2390-4ee0-b108-82661d0b6057'
);
```

### 2. Deletar histórico de movimentação de funil

```sql
DELETE FROM funnel_stage_history 
WHERE conversation_id IN (
  SELECT id FROM whatsapp_conversations 
  WHERE assigned_to = '8c2d85a0-2390-4ee0-b108-82661d0b6057'
);
```

### 3. Deletar as conversas/leads

```sql
DELETE FROM whatsapp_conversations 
WHERE assigned_to = '8c2d85a0-2390-4ee0-b108-82661d0b6057';
```

### 4. Limpar logs de atividade do Luiz

```sql
DELETE FROM user_activity_logs 
WHERE user_id = '8c2d85a0-2390-4ee0-b108-82661d0b6057';
```

---

## Resultado Final

Após a execução:
- **0** conversas atribuídas ao Luiz
- **0** mensagens nas conversas do Luiz
- **0** leads no CRM do Luiz
- **0** logs de atividade do Luiz
- O usuário Luiz continua existindo no sistema (pode receber novas conversas)

---

## Aviso Importante

Esta ação é **IRREVERSÍVEL**. Todos os dados serão permanentemente deletados do banco de dados.

Se preferir **preservar os leads mas apenas desatribuir** do Luiz (deixando para outro vendedor pegar), podemos fazer isso também.

---

## Execução

Usarei a ferramenta de inserção/deleção de dados para executar esses comandos SQL em sequência.


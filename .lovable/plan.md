
## Problema Identificado

O contato `555499574586` está em um estado "órfão":
- `is_crm_lead: true` → O sistema entende que é lead
- `crm_funnel_id: null` → Não tem funil atribuído
- `funnel_stage: null` → Não tem etapa atribuída

**Resultado:** O modal diz "já está no CRM" e fecha, mas o lead não aparece em lugar nenhum do Kanban porque não tem funil.

## Solução Proposta

### Mudança no `QuickAddLeadModal.tsx`

Quando detectar um contato que `is_crm_lead = true` **mas não tem funil**, em vez de apenas mostrar "já está no CRM" e fechar, vou:

1. **Atualizar o funil/etapa** do lead existente com os valores selecionados no modal
2. Mostrar mensagem "Lead atualizado" (não "já existe")

**Antes (código atual):**
```typescript
if (existing.is_crm_lead) {
  toast.info('Contato já existe', {
    description: `${existing.name || existing.phone} já está no CRM`,
  });
  onOpenChange(false);  // ❌ Fecha sem fazer nada
  return;
}
```

**Depois (código novo):**
```typescript
if (existing.is_crm_lead) {
  // Se já é lead mas não tem funil, permite atribuir
  if (!existing.crm_funnel_id) {
    const { error: updateError } = await supabase
      .from('whatsapp_conversations')
      .update({
        funnel_stage: stageId,
        crm_funnel_id: funnelId,
        name: name.trim() || existing.name || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) throw updateError;

    toast.success('Funil definido', {
      description: `${existing.name || existing.phone} foi adicionado ao funil`,
    });
    onOpenChange(false);
    return;
  }
  
  // Se já tem funil, mostra onde está
  toast.info('Contato já existe', {
    description: `${existing.name || existing.phone} já está no CRM`,
  });
  onOpenChange(false);
  return;
}
```

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/crm/QuickAddLeadModal.tsx` | Permitir atribuir funil a leads órfãos (is_crm_lead=true mas crm_funnel_id=null) |

## Fluxo Após a Correção

1. Usuário abre o modal "Adicionar ao CRM"
2. Sistema detecta que o contato já é lead mas não tem funil
3. Usuário seleciona o funil e etapa desejados
4. Clica em "Adicionar"
5. Sistema atualiza o `crm_funnel_id` e `funnel_stage`
6. Lead aparece no Kanban na etapa correta

## Plano de Teste

1. Abrir o modal para o contato `555499574586`
2. Selecionar "FUNIL POLÍTICA" e a primeira etapa
3. Clicar em "Adicionar"
4. Verificar que o lead aparece no Kanban do funil selecionado

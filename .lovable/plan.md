
# Plano: Corrigir Leitura do Status do Webhook

## Problema Identificado

A UAZAPI retorna um **ARRAY** de webhooks no endpoint `/webhook`:

```json
[
  {
    "addUrlEvents": false,
    "enabled": true,
    "events": ["messages.upsert", ...],
    "id": "r617e94d01d3281",
    "url": "https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/whatsapp-receive-webhook?instance=..."
  }
]
```

Mas o codigo atual tenta acessar como objeto:
```typescript
currentWebhookUrl = webhookData?.url || webhookData?.webhook?.url || ...
```

Isso retorna `undefined` porque `webhookData` e um array, nao um objeto.

## Solucao

Atualizar a logica para lidar com ambos os formatos (array ou objeto):

```typescript
// Handle both array and object response formats
let webhookConfig: Record<string, unknown> | null = null;

if (Array.isArray(webhookData)) {
  // UAZAPI returns array of webhooks - find the one matching our URL or get first enabled
  webhookConfig = webhookData.find((w: Record<string, unknown>) => 
    (w.url as string)?.includes('whatsapp-receive-webhook')
  ) || webhookData.find((w: Record<string, unknown>) => w.enabled === true) || webhookData[0];
} else {
  webhookConfig = webhookData;
}

if (webhookConfig) {
  currentWebhookUrl = webhookConfig.url as string || null;
}
```

## Arquivo a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/check-instance-status/index.ts` | Tratar resposta como array ou objeto |

## Resultado Esperado

1. Webhooks configurados corretamente serao detectados como "configured"
2. O painel mostrara o status correto (verde) para webhooks que estao funcionando
3. Apenas webhooks realmente nao configurados mostrarao erro


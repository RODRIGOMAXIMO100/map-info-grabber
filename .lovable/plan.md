

# Plano: Verificar Eventos do Webhook Automaticamente

## Problema

O sistema atual verifica apenas se a **URL do webhook** esta correta, mas nao verifica se os **eventos** estao configurados. Na UAZAPI, as tags de eventos podem ficar vazias sozinhas, e quando isso acontece as mensagens nao chegam ao sistema mesmo com a URL correta.

## Solucao

Adicionar verificacao dos eventos do webhook na rotina automatica, detectando quando:
1. Os eventos estao vazios
2. O evento "messages" (ou "messages.upsert") nao esta na lista
3. O webhook esta desabilitado (`enabled: false`)

## Modificacoes Tecnicas

### 1. Atualizar Interface de Status

Adicionar novo status intermediario para quando URL esta ok mas eventos estao errados:

| Status | Significado |
|--------|-------------|
| `configured` | URL correta + eventos configurados + habilitado |
| `events_missing` | URL correta mas eventos vazios/incompletos |
| `disabled` | URL correta mas webhook desabilitado |
| `misconfigured` | URL diferente da esperada |
| `not_configured` | Nenhum webhook configurado |
| `error` | Nao foi possivel verificar |

### 2. Edge Function `check-instance-status/index.ts`

Apos extrair o webhookConfig, verificar tambem os eventos:

```typescript
// Verificar eventos configurados
const events = webhookConfig.events as string[] | undefined;
const isEnabled = webhookConfig.enabled !== false;

// Lista de eventos obrigatorios
const requiredEvents = ['messages', 'messages.upsert'];
const hasRequiredEvent = events && events.some(e => 
  requiredEvents.some(req => e.toLowerCase().includes(req.toLowerCase()))
);

// Determinar status completo
if (currentWebhookUrl === expectedWebhookUrl) {
  if (!isEnabled) {
    webhookStatus = 'disabled';
  } else if (!events || events.length === 0 || !hasRequiredEvent) {
    webhookStatus = 'events_missing';
  } else {
    webhookStatus = 'configured';
  }
} else if (currentWebhookUrl) {
  webhookStatus = 'misconfigured';
} else {
  webhookStatus = 'not_configured';
}
```

### 3. Salvar Detalhes dos Eventos

Incluir informacoes dos eventos no objeto `details`:

```typescript
details = {
  ...details,
  webhookStatus,
  webhookUrl: currentWebhookUrl,
  webhookEnabled: isEnabled,
  webhookEvents: events || [],
  expectedWebhookUrl,
};
```

### 4. Atualizar UI `InstanceStatusPanel.tsx`

Adicionar novos badges e acoes:

| Status | Badge | Cor | Acao |
|--------|-------|-----|------|
| `configured` | "Webhook OK" | Verde | - |
| `events_missing` | "Eventos Vazios" | Laranja | Botao "Corrigir" |
| `disabled` | "Webhook Desabilitado" | Amarelo | Botao "Corrigir" |
| `misconfigured` | "Webhook Errado" | Amarelo | Botao "Corrigir" |
| `not_configured` | "Sem Webhook" | Vermelho | Botao "Corrigir" |

### 5. Atualizar `configure-webhook/index.ts`

Garantir que ao corrigir, sempre envia os eventos obrigatorios:

```typescript
body: JSON.stringify({
  url: expectedWebhookUrl,
  enabled: true,
  events: ['messages', 'messages.upsert', 'messages.update', 'connection.update'],
  // Formato alternativo usado por algumas versoes
  addUrlEvents: false,
})
```

## Fluxo de Verificacao Atualizado

```text
A cada 5 minutos (cron):
1. Buscar instancias ativas
2. Para cada instancia:
   a. Verificar conexao WhatsApp
   b. Buscar configuracao do webhook (GET /webhook)
   c. Verificar:
      - URL esta correta?
      - Webhook esta habilitado (enabled: true)?
      - Eventos contem "messages" ou "messages.upsert"?
   d. Determinar status final
3. Salvar status + detalhes no banco
4. UI exibe status com acao apropriada
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/check-instance-status/index.ts` | Verificar eventos e enabled do webhook |
| `supabase/functions/configure-webhook/index.ts` | Garantir eventos na configuracao |
| `src/components/instance/InstanceStatusPanel.tsx` | Novos badges e textos para status de eventos |

## Resultado Esperado

1. Sistema detecta automaticamente quando eventos do webhook estao vazios
2. Painel mostra "Eventos Vazios" (laranja) com botao para corrigir
3. Ao clicar em "Corrigir", sistema reconfigura URL + eventos + enabled
4. Visibilidade completa do motivo pelo qual mensagens nao estao chegando


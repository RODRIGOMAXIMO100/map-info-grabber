

# Plano: Verificacao Automatica de Webhook nas Instancias

## Problema Atual

A verificacao de webhook NAO e automatizada. Se o webhook parar de funcionar, as mensagens do WhatsApp nao chegam ao sistema, mesmo que a instancia mostre "conectado".

## Solucao

Integrar a verificacao de webhook na mesma rotina de verificacao de instancias (`check-instance-status`), criando uma verificacao completa que valida:
1. Conexao da sessao WhatsApp
2. Configuracao correta do webhook

## Modificacoes Tecnicas

### 1. Edge Function `check-instance-status/index.ts`

Adicionar verificacao de webhook apos verificar a conexao:

```typescript
// Apos verificar conexao da instancia, verificar webhook
const expectedWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-receive-webhook?instance=${config.id}`;

// Tentar buscar configuracao atual do webhook
const webhookEndpoints = ['/webhook', '/config/webhook', '/instance/webhook'];
let webhookConfig = null;
let webhookStatus: 'configured' | 'misconfigured' | 'not_configured' | 'error' = 'error';

for (const endpoint of webhookEndpoints) {
  try {
    const webhookResponse = await fetch(`${serverUrl}${endpoint}`, {
      method: 'GET',
      headers: { 'token': config.instance_token },
    });
    if (webhookResponse.ok) {
      webhookConfig = await webhookResponse.json();
      break;
    }
  } catch { /* continue */ }
}

if (webhookConfig) {
  const currentUrl = webhookConfig?.url || webhookConfig?.webhook?.url;
  if (currentUrl === expectedWebhookUrl) {
    webhookStatus = 'configured';
  } else if (currentUrl) {
    webhookStatus = 'misconfigured';
  } else {
    webhookStatus = 'not_configured';
  }
}
```

### 2. Atualizar Interface de Resultado

Adicionar campos de webhook ao `StatusResult`:

```typescript
interface StatusResult {
  configId: string;
  name: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  rawState: string | null;
  webhookStatus: 'configured' | 'misconfigured' | 'not_configured' | 'error';
  webhookUrl: string | null;
  expectedWebhookUrl: string;
  details: Record<string, unknown>;
}
```

### 3. Salvar Status do Webhook no Banco

```typescript
await supabase
  .from('whatsapp_instance_status')
  .insert({
    config_id: config.id,
    status,
    details: {
      ...details,
      rawState,
      webhookStatus,
      webhookUrl: currentWebhookUrl,
      expectedWebhookUrl,
    },
  });
```

### 4. Atualizar UI `InstanceStatusPanel.tsx`

Mostrar status do webhook junto com status da conexao:

- Icone verde: Webhook configurado corretamente
- Icone amarelo: Webhook configurado mas URL diferente (misconfigured)  
- Icone vermelho: Webhook nao configurado
- Botao "Corrigir Webhook" quando misconfigured/not_configured

### 5. Alertas de Problemas

Adicionar log de warning quando webhook estiver errado:

```typescript
const webhookProblems = results.filter(r => r.webhookStatus !== 'configured');
if (webhookProblems.length > 0) {
  console.warn(`⚠️ Webhook problems: ${webhookProblems.map(w => 
    `${w.name} (${w.webhookStatus})`).join(', ')}`);
}
```

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/check-instance-status/index.ts` | Adicionar verificacao de webhook |
| `src/components/instance/InstanceStatusPanel.tsx` | Exibir status do webhook na UI |

## Fluxo Apos Implementacao

```text
A cada 5 minutos (cron):
1. Buscar instancias ativas
2. Para cada instancia:
   a. Verificar conexao WhatsApp (/instance/status)
   b. Verificar configuracao webhook (/webhook)
3. Salvar ambos status na tabela
4. Log de warnings para problemas
5. UI exibe status completo (conexao + webhook)
```

## Resultado Esperado

1. Dashboard mostra status da conexao E do webhook
2. Alertas automaticos quando webhook estiver mal configurado
3. Botao para corrigir webhook com um clique
4. Visibilidade completa da saude de cada instancia


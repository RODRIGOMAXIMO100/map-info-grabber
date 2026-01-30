

# Plano: Sistema de Verificacao de Conexao de Instancias Mais Eficiente

## Problema Identificado

O sistema atual de verificacao esta usando o endpoint **errado** da UAZAPI:

- **Endpoint atual**: `/status` - Retorna o status do **servidor UAZAPI** (que sempre mostra "running")
- **Endpoint correto**: `/instance/connectionState/{instance}` - Retorna o status real da **sessao WhatsApp**

Isso explica por que o painel mostra "conectado" mesmo quando as instancias estao desconectadas no UAZAPI - porque o servidor esta funcionando, mas as sessoes WhatsApp nao estao.

## Analise da Resposta Atual

```json
{
  "status": {
    "server_status": "running",      // <- SERVIDOR rodando, nao a sessao
    "checked_instance": {
      "connection_status": "connected" // <- Falso positivo!
    }
  }
}
```

O codigo interpreta `server_status: running` como "instancia conectada", o que e incorreto.

## Solucao

### 1. Usar o Endpoint Correto da UAZAPI

Alterar de:
```
GET /status
```

Para:
```
GET /instance/connectionState/{instance_phone}
```

Exemplo: `https://pulsarai.uazapi.com/instance/connectionState/553199579600`

### 2. Interpretar a Resposta Correta

A UAZAPI retorna para o endpoint `connectionState`:

```json
{
  "instance": "553199579600",
  "state": "open"           // ou "close", "connecting", "refused"
}
```

Possiveis valores de `state`:
- `open` = Conectado ao WhatsApp
- `close` = Desconectado/Sessao encerrada  
- `connecting` = Tentando conectar
- `refused` = Conexao recusada

### 3. Adicionar Fallback e Logs Detalhados

Para debug, incluir:
- Log da URL chamada
- Log da resposta completa
- Log do estado interpretado

## Modificacoes

### Arquivo: `supabase/functions/check-instance-status/index.ts`

**Mudanca 1**: Usar o campo `instance_phone` para construir a URL correta

```typescript
// Buscar tambem o instance_phone
.select('id, name, server_url, instance_token, instance_phone, is_active')
```

**Mudanca 2**: Alterar os endpoints para incluir o correto

```typescript
const endpoints = [
  // Endpoint principal correto da UAZAPI
  `${serverUrl}/instance/connectionState/${config.instance_phone}`,
  // Fallbacks
  `${serverUrl}/status`,
  `${serverUrl}/instance/status`,
];
```

**Mudanca 3**: Melhorar a logica de interpretacao

```typescript
// UAZAPI connectionState retorna { state: "open" | "close" | "connecting" | "refused" }
const isConnected = 
  data.state === 'open' ||
  data.connected === true ||
  // Fallback para formato antigo do /status (menos confiavel)
  (data.status?.checked_instance?.connection_status === 'connected' && 
   data.status?.checked_instance?.is_healthy === true);
```

**Mudanca 4**: Adicionar logs detalhados

```typescript
console.log(`[Status Check] Instance: ${config.name}`);
console.log(`[Status Check] Endpoint: ${usedEndpoint}`);
console.log(`[Status Check] Response:`, JSON.stringify(data));
console.log(`[Status Check] Interpreted state: ${status}`);
```

### 4. Melhorar UI com mais detalhes

Mostrar no painel:
- Estado detalhado (open/close/connecting/refused)
- Resposta raw para debug
- Botao para reconectar/escanear QR code

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/check-instance-status/index.ts` | Usar endpoint correto + melhorar logs |
| `src/components/instance/InstanceStatusPanel.tsx` | Mostrar mais detalhes do status |

## Fluxo Apos Correcao

```text
1. Edge function busca whatsapp_config incluindo instance_phone
2. Para cada instancia, chama /instance/connectionState/{phone}
3. Interpreta state: "open" = conectado, outros = desconectado
4. Salva resultado na tabela whatsapp_instance_status
5. Frontend exibe status correto com detalhes
```

## Resultado Esperado

1. Status mostrado no painel reflete a realidade da sessao WhatsApp
2. Instancias desconectadas sao identificadas corretamente
3. Logs detalhados para facilitar debug
4. Possibilidade de ver o estado exato (open/close/connecting/refused)


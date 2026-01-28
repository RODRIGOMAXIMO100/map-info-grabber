

# Plano: Corrigir Geracao de Link WhatsApp para Numeros Fixos

## Problema Identificado

Nas edge functions `search-businesses-serpapi` e `search-businesses`, o codigo atual:

```typescript
// Linha 30-35 de search-businesses-serpapi/index.ts
function extractWhatsApp(phone: string | null): string {
  if (!phone || !isMobileNumber(phone)) return '';  // PROBLEMA: Exclui fixos!
  // ...
}
```

Isso faz com que leads com numeros fixos aparecam SEM link do WhatsApp, mesmo que a empresa use WhatsApp Business vinculado ao fixo.

## Realidade do Mercado

- WhatsApp Business permite vincular numeros fixos
- Muitas empresas usam o mesmo numero fixo para ligacoes e WhatsApp Business
- Ao excluir fixos, estamos perdendo leads validos

---

## Solucao

### 1. Gerar Link WhatsApp para TODOS os Numeros Validos

Alterar as funcoes `extractWhatsApp` nas duas edge functions:

```typescript
// ANTES (incorreto)
function extractWhatsApp(phone: string | null): string {
  if (!phone || !isMobileNumber(phone)) return '';
  // ...
}

// DEPOIS (correto)
function extractWhatsApp(phone: string | null): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  
  // Validar comprimento minimo (DDD + numero)
  if (digits.length < 10) return '';
  
  // Adicionar codigo do Brasil se nao presente
  if (!digits.startsWith('55')) {
    digits = '55' + digits;
  }
  
  // Validar comprimento final (12-13 digitos para Brasil)
  if (digits.length < 12 || digits.length > 13) return '';
  
  return `https://wa.me/${digits}`;
}
```

### 2. Manter Indicador de Tipo (Celular vs Fixo)

A informacao de celular/fixo continua util para o usuario, mas nao deve impedir a geracao do link. A funcao `isMobileNumber` permanece para classificacao visual.

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/search-businesses-serpapi/index.ts` | Alterar `extractWhatsApp` (linhas 29-35) |
| `supabase/functions/search-businesses/index.ts` | Alterar `extractWhatsApp` (linhas 36-56) |

---

## Impacto

**Antes:**
- Lead com fixo (31) 3555-1234: whatsapp = "" (vazio)
- Aparece sem icone de WhatsApp

**Depois:**
- Lead com fixo (31) 3555-1234: whatsapp = "https://wa.me/553135551234"
- Aparece COM icone de WhatsApp
- Usuario pode tentar contato (se nao tiver WhatsApp, vai falhar no envio - melhor do que nao tentar)

---

## Resultado Esperado

- Todos os leads com telefone valido terao link de WhatsApp gerado
- A classificacao celular/fixo continua sendo exibida como informacao adicional
- Usuarios poderao tentar contato via WhatsApp mesmo para numeros fixos


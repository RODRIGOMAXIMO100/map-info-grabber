
# Plano: Sistema de Senha Padrao Visivel para Administradores

## Objetivo

Permitir que administradores definam e visualizem uma senha padrao para qualquer usuario, facilitando o acesso quando necessario.

## Como Vai Funcionar

1. No Painel de Administracao, cada usuario tera um botao "Definir Senha Padrao"
2. Ao clicar, o sistema define uma senha predeterminada (ex: `Acesso@2025`) para aquele usuario
3. A senha definida aparece na tela para o admin copiar
4. O admin pode usar essa senha para fazer login como aquele usuario

## Implementacao

### 1. Modificar Modal de Edicao de Usuario

Arquivo: `src/pages/AdminPanel.tsx`

Adicionar um botao "Definir Senha Padrao" que:
- Define uma senha fixa conhecida (ex: `Acesso@2025!`)
- Mostra a senha na tela apos definir
- Permite copiar com um clique

```text
+------------------------------------------+
|  Editar Usuario: Grazi bailon            |
+------------------------------------------+
|  Nome: [Grazi bailon          ]          |
|  Novo Email: [                ]          |
|  Nova Senha: [                ] [👁]     |
|                                          |
|  --- OU ---                              |
|                                          |
|  [🔑 Definir Senha Padrao]               |
|                                          |
|  Senha definida: Acesso@2025!  [📋 Copiar]|
|                                          |
|            [Cancelar]  [Salvar]          |
+------------------------------------------+
```

### 2. Adicionar Coluna de Email na Tabela de Usuarios

Para facilitar o login, mostrar o email de cada usuario na tabela.

**Problema atual:** Os emails estao na tabela `auth.users` do Supabase, que nao e acessivel diretamente pelo frontend.

**Solucao:** Modificar a edge function `update-user` para tambem retornar os emails dos usuarios, ou criar uma nova funcao para buscar essa informacao.

### 3. Criar Edge Function para Listar Emails

Nova edge function: `supabase/functions/list-user-emails/index.ts`

Esta funcao usara o `supabase.auth.admin.listUsers()` para buscar os emails de todos os usuarios e retornar para o painel admin.

```typescript
// Pseudocodigo
const { data } = await supabaseAdmin.auth.admin.listUsers();
// Retorna { userId: email } para cada usuario
```

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `supabase/functions/list-user-emails/index.ts` | CRIAR - Buscar emails dos usuarios |
| `src/pages/AdminPanel.tsx` | MODIFICAR - Adicionar coluna email + botao senha padrao |

## Fluxo do Admin

```text
1. Admin abre Painel de Administracao
2. Ve a lista de usuarios com Nome, Email, Papel
3. Clica em "Editar" no usuario desejado
4. Clica em "Definir Senha Padrao"
5. Sistema define a senha e mostra: "Acesso@2025!"
6. Admin copia o email e a senha
7. Admin faz login com essas credenciais
```

## Consideracoes de Seguranca

- Apenas administradores podem acessar essa funcionalidade (verificacao de role)
- A senha padrao e sempre a mesma para facilitar memorização
- O usuario pode trocar sua senha depois se quiser
- Logs de atividade registram quando um admin redefine a senha

## Resultado Esperado

O administrador podera:
1. Ver o email de cada usuario
2. Definir uma senha conhecida com um clique
3. Copiar as credenciais para fazer login quando necessario

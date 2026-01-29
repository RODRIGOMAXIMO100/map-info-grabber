
# Plano: Adicionar Funcionalidade de Alteracao de Senha pelo Admin

## Problema
O usuario `rodrigo@maximoacelera.com.br` esta com problemas de senha e nao consegue fazer login. O administrador precisa de uma forma de redefinir senhas de usuarios pelo painel administrativo.

## Diagnostico dos Logs
Os auth-logs mostram tentativas de login falhando com "Invalid login credentials":
- Timestamp: 13:22:55 - email: rodrigo@maximoacelera.com.br - Status 400 (invalid_credentials)
- Timestamp: 13:23:29 - Outra tentativa falhou

## Solucao

### Arquitetura Atual
O sistema ja possui:
1. `AdminPanel.tsx` - Modal de edicao com campos para nome e email
2. `update-user/index.ts` - Edge function que atualiza email e nome usando `supabaseAdmin.auth.admin.updateUserById()`

### Modificacoes Necessarias

#### 1. Edge Function: `supabase/functions/update-user/index.ts`
Adicionar suporte para alteracao de senha usando a mesma API admin:

```typescript
const { userId, newEmail, newName, newPassword } = await req.json()

// ... codigo existente ...

// Atualizar senha no auth (se fornecida)
if (newPassword) {
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword
  })
  if (passwordError) {
    console.error('Error updating password:', passwordError)
    return new Response(
      JSON.stringify({ error: passwordError.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}
```

#### 2. Frontend: `src/pages/AdminPanel.tsx`

**Adicionar estados:**
```typescript
const [editPassword, setEditPassword] = useState('');
const [showPassword, setShowPassword] = useState(false);
```

**Atualizar modal de edicao:**
- Adicionar campo de senha com toggle de visibilidade
- Adicionar validacao de tamanho minimo (6 caracteres)
- Resetar campo ao fechar modal

**Atualizar funcao handleSaveEdit:**
```typescript
const { data, error } = await supabase.functions.invoke('update-user', {
  body: {
    userId: editingUser.user_id,
    newName: editName !== editingUser.full_name ? editName : undefined,
    newEmail: editEmail.trim() || undefined,
    newPassword: editPassword.trim() || undefined, // NOVO
  }
});
```

## UI do Modal Atualizado

O modal tera 3 campos:
1. **Nome** - campo texto (obrigatorio)
2. **Novo Email** - campo email (opcional)
3. **Nova Senha** - campo senha com botao de mostrar/ocultar (opcional, minimo 6 caracteres)

## Seguranca

1. A edge function ja verifica se o usuario logado e admin antes de permitir alteracoes
2. Usa `SUPABASE_SERVICE_ROLE_KEY` para operacoes administrativas
3. Senha e transmitida via HTTPS
4. Nenhuma senha e logada no console

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/update-user/index.ts` | Adicionar campo `newPassword` e logica de atualizacao |
| `src/pages/AdminPanel.tsx` | Adicionar campo de senha no modal de edicao |

## Correcao Imediata para Rodrigo

Apos implementar a funcionalidade, o administrador podera:
1. Acessar o Painel de Administracao
2. Clicar no icone de lapis (editar) do usuario Rodrigo
3. Inserir uma nova senha no campo "Nova Senha"
4. Clicar em Salvar

A senha sera atualizada imediatamente e Rodrigo podera fazer login.

## Resultado Esperado

1. Administradores poderao redefinir senhas de qualquer usuario pelo painel
2. Interface clara com campo de senha e toggle de visibilidade
3. Validacao de tamanho minimo da senha
4. Feedback visual de sucesso/erro



## Plano: Corrigir Políticas RLS da Tabela crm_funnels

### Problema Identificado
A tabela `crm_funnels` não possui políticas RLS para INSERT, UPDATE e DELETE. Seu usuário é admin, mas sem as políticas correspondentes, o banco de dados bloqueia qualquer tentativa de criar/editar/excluir funis.

### Solução
Criar políticas RLS que permitem usuários com role `admin` gerenciar funis.

---

### Migração SQL a Ser Aplicada

```sql
-- Política para permitir admins criarem funis
CREATE POLICY "Admins can insert funnels"
ON public.crm_funnels
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Política para permitir admins atualizarem funis
CREATE POLICY "Admins can update funnels"
ON public.crm_funnels
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Política para permitir admins excluírem funis
CREATE POLICY "Admins can delete funnels"
ON public.crm_funnels
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
```

---

### O Que Será Feito

1. **Aplicar a migração SQL** usando a ferramenta de migração do banco de dados
2. Nenhuma alteração de código é necessária - o `FunnelManager.tsx` já está correto

---

### Resultado Esperado

Após a migração:
- Admins poderão criar novos funis ✅
- Admins poderão editar funis existentes ✅
- Admins poderão excluir funis (exceto o padrão, que é bloqueado no código) ✅
- SDRs e Closers continuarão apenas visualizando funis aos quais foram atribuídos

---

### Nota Técnica

A função `has_role()` já existe no banco e é `SECURITY DEFINER`, evitando problemas de recursão infinita em políticas RLS.


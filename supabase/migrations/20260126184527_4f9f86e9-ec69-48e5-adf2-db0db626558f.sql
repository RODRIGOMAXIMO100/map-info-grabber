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
-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage funnel users" ON crm_funnel_users;

-- Create a new PERMISSIVE policy for admins to manage funnel users
CREATE POLICY "Admins can manage funnel users"
ON crm_funnel_users
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
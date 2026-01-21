import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar se o usuário é admin usando o token do request
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar role admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleData?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId } = await req.json()

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Impedir que admin delete a si mesmo
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete yourself' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Usar admin client para deletar usuário
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Limpar referências ao usuário antes de deletar
    // Desassociar conversas
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ assigned_to: null, transferred_by: null })
      .or(`assigned_to.eq.${userId},transferred_by.eq.${userId}`)

    // Limpar mensagens enviadas pelo usuário (setar como null)
    await supabaseAdmin
      .from('whatsapp_messages')
      .update({ sent_by_user_id: null })
      .eq('sent_by_user_id', userId)

    // Remover de funnel_users
    await supabaseAdmin
      .from('crm_funnel_users')
      .delete()
      .eq('user_id', userId)

    // Desassociar broadcasts
    await supabaseAdmin
      .from('broadcast_lists')
      .update({ assigned_to: null })
      .eq('assigned_to', userId)

    // Deletar logs de atividade
    await supabaseAdmin
      .from('user_activity_logs')
      .delete()
      .eq('user_id', userId)

    // Deletar role
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)

    // Deletar profile
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId)

    // Agora deletar do auth.users
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (error) {
      console.error('Error deleting user:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    console.error('Error in delete-user function:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

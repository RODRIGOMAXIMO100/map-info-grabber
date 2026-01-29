import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissionsAdmin } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Shield, Users, UserCheck, UserX, RefreshCw, Pencil, Trash2, Lock, Plug, Key, Copy, Check, Plus, Trash, Eye, EyeOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';

interface UserWithRole {
  id: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  created_at: string;
  role: 'admin' | 'sdr' | 'closer' | null;
  email?: string;
}

interface ApiKey {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  last_used_at: string | null;
  usage_count: number;
  created_at: string;
}

interface FunnelWithStages {
  id: string;
  name: string;
  stages: { id: string; name: string; stage_order: number }[];
}

const AdminPanel = () => {
  const { isAdmin, loading: authLoading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Estado para modal de edição
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Estado para modal de confirmação de exclusão
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<UserWithRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Estado para integrações
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [funnels, setFunnels] = useState<FunnelWithStages[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<string | null>(null);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);

  // Estado para emails dos usuários
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  
  // Estado para senha padrão
  const [settingDefaultPassword, setSettingDefaultPassword] = useState(false);
  const [defaultPasswordSet, setDefaultPasswordSet] = useState(false);
  const DEFAULT_PASSWORD = 'Acesso@2025!';

  // Permissões
  const { 
    permissionsByRoute, 
    loading: permLoading, 
    updating: permUpdating,
    updatePermission,
    refresh: refreshPermissions 
  } = usePermissionsAdmin();

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadApiKeys();
      loadFunnels();
      loadUserEmails();
    }
  }, [isAdmin]);

  const loadUserEmails = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('list-user-emails');
      if (error) throw error;
      if (data?.emails) {
        setUserEmails(data.emails);
      }
    } catch (error) {
      console.error('Error loading user emails:', error);
    }
  };

  const loadApiKeys = async () => {
    try {
      setLoadingKeys(true);
      const { data, error } = await supabase
        .from('integration_api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error) {
      console.error('Error loading API keys:', error);
    } finally {
      setLoadingKeys(false);
    }
  };

  const loadFunnels = async () => {
    try {
      const { data: funnelsData, error: funnelsError } = await supabase
        .from('crm_funnels')
        .select('id, name');

      if (funnelsError) throw funnelsError;

      const funnelsWithStages: FunnelWithStages[] = [];
      for (const funnel of funnelsData || []) {
        const { data: stagesData } = await supabase
          .from('crm_funnel_stages')
          .select('id, name, stage_order')
          .eq('funnel_id', funnel.id)
          .order('stage_order', { ascending: true });

        funnelsWithStages.push({
          ...funnel,
          stages: stagesData || [],
        });
      }
      setFunnels(funnelsWithStages);
    } catch (error) {
      console.error('Error loading funnels:', error);
    }
  };

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'lv_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error('Digite um nome para a chave');
      return;
    }

    try {
      setCreatingKey(true);
      const apiKey = generateApiKey();

      const { error } = await supabase
        .from('integration_api_keys')
        .insert({
          name: newKeyName.trim(),
          api_key: apiKey,
          created_by: currentUser?.id,
        });

      if (error) throw error;

      toast.success('Chave criada com sucesso!');
      setNewKeyName('');
      loadApiKeys();
    } catch (error) {
      console.error('Error creating API key:', error);
      toast.error('Erro ao criar chave');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleToggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('integration_api_keys')
        .update({ is_active: !currentStatus })
        .eq('id', keyId);

      if (error) throw error;
      toast.success(currentStatus ? 'Chave desativada' : 'Chave ativada');
      loadApiKeys();
    } catch (error) {
      console.error('Error toggling key status:', error);
      toast.error('Erro ao atualizar chave');
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      setDeletingKeyId(keyId);
      const { error } = await supabase
        .from('integration_api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;
      toast.success('Chave deletada');
      loadApiKeys();
    } catch (error) {
      console.error('Error deleting key:', error);
      toast.error('Erro ao deletar chave');
    } finally {
      setDeletingKeyId(null);
    }
  };

  const copyToClipboard = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success('Copiado!');
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      
      // Fetch all profiles (admin can see all)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.user_id);
        return {
          ...profile,
          role: userRole?.role as 'admin' | 'sdr' | 'closer' | null || null,
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setUpdating(userId);

      if (newRole === 'none') {
        // Remove role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Check if user already has a role
        const existingUser = users.find(u => u.user_id === userId);
        
        if (existingUser?.role) {
          // Update existing role
          const { error } = await supabase
            .from('user_roles')
            .update({ role: newRole as 'admin' | 'sdr' | 'closer' })
            .eq('user_id', userId);

          if (error) throw error;
        } else {
          // Insert new role
          const { error } = await supabase
            .from('user_roles')
            .insert({ user_id: userId, role: newRole as 'admin' | 'sdr' | 'closer' });

          if (error) throw error;
        }
      }

      toast.success('Papel atualizado com sucesso!');
      loadUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error('Erro ao atualizar papel');
    } finally {
      setUpdating(null);
    }
  };

  const handleEditClick = (user: UserWithRole) => {
    setEditingUser(user);
    setEditName(user.full_name);
    setEditEmail('');
    setEditPassword('');
    setShowPassword(false);
    setDefaultPasswordSet(false);
    setEditModalOpen(true);
  };

  const handleSetDefaultPassword = async () => {
    if (!editingUser) return;

    try {
      setSettingDefaultPassword(true);

      const { data, error } = await supabase.functions.invoke('update-user', {
        body: {
          userId: editingUser.user_id,
          newPassword: DEFAULT_PASSWORD,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setDefaultPasswordSet(true);
      toast.success('Senha padrão definida com sucesso!');
    } catch (error: unknown) {
      console.error('Error setting default password:', error);
      const message = error instanceof Error ? error.message : 'Erro ao definir senha padrão';
      toast.error(message);
    } finally {
      setSettingDefaultPassword(false);
    }
  };

  const copyCredentials = (email: string) => {
    const credentials = `Email: ${email}\nSenha: ${DEFAULT_PASSWORD}`;
    navigator.clipboard.writeText(credentials);
    toast.success('Email e senha copiados!');
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;

    try {
      setSaving(true);

      // Validar senha se fornecida
      if (editPassword.trim() && editPassword.trim().length < 6) {
        toast.error('A senha deve ter pelo menos 6 caracteres');
        setSaving(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('update-user', {
        body: {
          userId: editingUser.user_id,
          newName: editName !== editingUser.full_name ? editName : undefined,
          newEmail: editEmail.trim() || undefined,
          newPassword: editPassword.trim() || undefined,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Usuário atualizado com sucesso!');
      setEditModalOpen(false);
      loadUsers();
    } catch (error: unknown) {
      console.error('Error updating user:', error);
      const message = error instanceof Error ? error.message : 'Erro ao atualizar usuário';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (user: UserWithRole) => {
    setDeletingUser(user);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;

    try {
      setDeleting(true);

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          userId: deletingUser.user_id
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success('Usuário deletado com sucesso!');
      setDeleteModalOpen(false);
      loadUsers();
    } catch (error: unknown) {
      console.error('Error deleting user:', error);
      const message = error instanceof Error ? error.message : 'Erro ao deletar usuário';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handlePermissionToggle = async (routeKey: string, role: 'sdr' | 'closer', currentValue: boolean) => {
    const success = await updatePermission(role, routeKey, !currentValue);
    if (success) {
      toast.success('Permissão atualizada!');
    } else {
      toast.error('Erro ao atualizar permissão');
    }
  };

  const getRoleBadge = (role: string | null) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500 hover:bg-red-600">Admin</Badge>;
      case 'sdr':
        return <Badge className="bg-blue-500 hover:bg-blue-600">SDR</Badge>;
      case 'closer':
        return <Badge className="bg-green-500 hover:bg-green-600">Closer</Badge>;
      default:
        return <Badge variant="secondary">Sem papel</Badge>;
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Painel de Administração</h1>
            <p className="text-muted-foreground">Gerencie usuários e permissões</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="users" className="space-y-4">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Lock className="h-4 w-4" />
            Permissões
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Plug className="h-4 w-4" />
            Integrações
          </TabsTrigger>
        </TabsList>

        {/* ABA DE USUÁRIOS */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={loadUsers} variant="outline" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Com Papel Atribuído</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter(u => u.role).length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sem Papel</CardTitle>
                <UserX className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {users.filter(u => !u.role).length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                Gerencie os papéis de cada usuário no sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Papel Atual</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead>Alterar Papel</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.full_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-muted-foreground">
                              {userEmails[user.user_id] || '-'}
                            </span>
                            {userEmails[user.user_id] && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  navigator.clipboard.writeText(userEmails[user.user_id]);
                                  toast.success('Email copiado!');
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getRoleBadge(user.role)}
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={user.role || 'none'}
                            onValueChange={(value) => handleRoleChange(user.user_id, value)}
                            disabled={updating === user.user_id}
                          >
                            <SelectTrigger className="w-32">
                              {updating === user.user_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <SelectValue />
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Sem papel</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="sdr">SDR</SelectItem>
                              <SelectItem value="closer">Closer</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditClick(user)}
                              title="Editar usuário"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(user)}
                              disabled={user.user_id === currentUser?.id}
                              title={user.user_id === currentUser?.id ? "Você não pode deletar a si mesmo" : "Deletar usuário"}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA DE PERMISSÕES */}
        <TabsContent value="permissions" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={refreshPermissions} variant="outline" disabled={permLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${permLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Permissões por Role</CardTitle>
              <CardDescription>
                Defina quais menus cada tipo de usuário pode acessar. Administradores sempre têm acesso total.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {permLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[250px]">Menu</TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Badge className="bg-blue-500">SDR</Badge>
                        </div>
                      </TableHead>
                      <TableHead className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Badge className="bg-green-500">Closer</Badge>
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissionsByRoute.map((perm) => (
                      <TableRow key={perm.route_key}>
                        <TableCell className="font-medium">
                          {perm.route_label}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Switch
                              checked={perm.sdr}
                              onCheckedChange={() => handlePermissionToggle(perm.route_key, 'sdr', perm.sdr)}
                              disabled={permUpdating === `sdr-${perm.route_key}`}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center">
                            <Switch
                              checked={perm.closer}
                              onCheckedChange={() => handlePermissionToggle(perm.route_key, 'closer', perm.closer)}
                              disabled={permUpdating === `closer-${perm.route_key}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {permissionsByRoute.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhuma permissão configurada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA DE INTEGRAÇÕES */}
        <TabsContent value="integrations" className="space-y-4">
          {/* API Keys Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Chaves de API
              </CardTitle>
              <CardDescription>
                Gerencie chaves de API para integrar sistemas externos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Create new key */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da chave (ex: Formulário Site)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()}>
                  {creatingKey ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Chave
                    </>
                  )}
                </Button>
              </div>

              {/* Keys list */}
              {loadingKeys ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma chave criada. Crie uma chave para começar a integrar.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Chave</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uso</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {showKey === key.id ? key.api_key : `${key.api_key.substring(0, 8)}...`}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setShowKey(showKey === key.id ? null : key.id)}
                            >
                              {showKey === key.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(key.api_key, key.id)}
                            >
                              {copiedKey === key.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.is_active ? 'default' : 'secondary'}>
                            {key.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {key.usage_count} requisições
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={key.is_active}
                              onCheckedChange={() => handleToggleKeyStatus(key.id, key.is_active)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteKey(key.id)}
                              disabled={deletingKeyId === key.id}
                            >
                              {deletingKeyId === key.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* API Documentation */}
          <Card>
            <CardHeader>
              <CardTitle>Documentação da API</CardTitle>
              <CardDescription>
                Como integrar seu sistema externo para enviar leads
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Endpoint */}
              <div>
                <Label className="text-sm font-medium">Endpoint</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono">
                    POST https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/receive-external-lead
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard('https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/receive-external-lead', 'endpoint')}
                  >
                    {copiedKey === 'endpoint' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Headers */}
              <div>
                <Label className="text-sm font-medium">Headers Obrigatórios</Label>
                <pre className="mt-1 text-sm bg-muted px-3 py-2 rounded font-mono overflow-x-auto">
{`Content-Type: application/json
X-API-Key: sua_chave_api_aqui`}
                </pre>
              </div>

              {/* Payload Example */}
              <div>
                <Label className="text-sm font-medium">Exemplo de Payload</Label>
                <ScrollArea className="h-[300px] mt-1">
                  <pre className="text-sm bg-muted px-3 py-2 rounded font-mono">
{`{
  "phone": "5534999999999",    // Obrigatório - Telefone com DDD
  "name": "Nome do Lead",       // Opcional
  "funnel_id": "uuid",          // Opcional - ID do funil
  "stage_id": "uuid",           // Opcional - ID da etapa
  "origin": "formulario_site",  // Opcional - Origem do lead
  "notes": "Observações",       // Opcional
  "city": "Uberlândia",         // Opcional
  "state": "MG",                // Opcional
  "tags": ["tag1", "tag2"],     // Opcional
  
  // UTMs para rastreamento de marketing
  "utm_source": "google",       // Opcional
  "utm_medium": "cpc",          // Opcional  
  "utm_campaign": "black_friday", // Opcional
  "utm_term": "keyword",        // Opcional
  "utm_content": "ad_variant"   // Opcional
}`}
                  </pre>
                </ScrollArea>
              </div>

              {/* Response Example */}
              <div>
                <Label className="text-sm font-medium">Resposta de Sucesso</Label>
                <pre className="mt-1 text-sm bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 rounded font-mono">
{`{
  "success": true,
  "lead_id": "uuid-do-lead",
  "is_new": true,
  "message": "Lead criado com sucesso",
  "phone": "5534999999999"
}`}
                </pre>
              </div>

              {/* JavaScript Example */}
              <div>
                <Label className="text-sm font-medium">Exemplo JavaScript (Formulário)</Label>
                <ScrollArea className="h-[280px] mt-1">
                  <pre className="text-sm bg-muted px-3 py-2 rounded font-mono">
{`// Capturar UTMs da URL
const urlParams = new URLSearchParams(window.location.search);

const formData = {
  phone: document.getElementById('phone').value,
  name: document.getElementById('name').value,
  origin: "landing_page",
  utm_source: urlParams.get('utm_source'),
  utm_medium: urlParams.get('utm_medium'),
  utm_campaign: urlParams.get('utm_campaign'),
  utm_term: urlParams.get('utm_term'),
  utm_content: urlParams.get('utm_content'),
};

fetch('https://vorehtfxwvsbbivnskeq.supabase.co/functions/v1/receive-external-lead', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'sua_chave_api_aqui'
  },
  body: JSON.stringify(formData)
})
.then(response => response.json())
.then(data => console.log('Lead criado:', data))
.catch(error => console.error('Erro:', error));`}
                  </pre>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          {/* Funnels & Stages Reference */}
          <Card>
            <CardHeader>
              <CardTitle>Funis e Etapas Disponíveis</CardTitle>
              <CardDescription>
                Use esses IDs no payload para direcionar leads para funis/etapas específicos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnels.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  Nenhum funil configurado
                </div>
              ) : (
                <div className="space-y-4">
                  {funnels.map((funnel) => (
                    <div key={funnel.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{funnel.name}</span>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded">{funnel.id}</code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(funnel.id, `funnel-${funnel.id}`)}
                          >
                            {copiedKey === `funnel-${funnel.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 ml-4">
                        {funnel.stages.map((stage) => (
                          <div key={stage.id} className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {stage.stage_order + 1}. {stage.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-muted px-2 py-1 rounded">{stage.id}</code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(stage.id, `stage-${stage.id}`)}
                              >
                                {copiedKey === `stage-${stage.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Edição */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize o nome, email ou senha do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Email atual do usuário */}
            {editingUser && userEmails[editingUser.user_id] && (
              <div className="bg-muted/50 p-3 rounded-lg">
                <Label className="text-xs text-muted-foreground">Email atual</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm font-medium">{userEmails[editingUser.user_id]}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(userEmails[editingUser.user_id]);
                      toast.success('Email copiado!');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="editName">Nome</Label>
              <Input
                id="editName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Novo Email (opcional)</Label>
              <Input
                id="editEmail"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="novo@email.com"
              />
              <p className="text-xs text-muted-foreground">
                Deixe em branco para manter o email atual
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPassword">Nova Senha (opcional)</Label>
              <div className="relative">
                <Input
                  id="editPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Deixe em branco para manter a senha atual
              </p>
            </div>

            {/* Seção de Senha Padrão */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Key className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Acesso Rápido (Senha Padrão)</Label>
              </div>
              
              {!defaultPasswordSet ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSetDefaultPassword}
                  disabled={settingDefaultPassword}
                >
                  {settingDefaultPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Definir Senha Padrão
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-green-500">Senha definida!</span>
                    </div>
                    <div className="flex items-center justify-between bg-background p-2 rounded">
                      <code className="text-sm font-mono">{DEFAULT_PASSWORD}</code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(DEFAULT_PASSWORD);
                          toast.success('Senha copiada!');
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                  
                  {editingUser && userEmails[editingUser.user_id] && (
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => copyCredentials(userEmails[editingUser.user_id])}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Email + Senha
                    </Button>
                  )}
                </div>
              )}
              
              <p className="text-xs text-muted-foreground mt-2">
                Use para acessar a conta deste usuário quando necessário
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão */}
      <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o usuário <strong>{deletingUser?.full_name}</strong>?
              <br />
              <br />
              Esta ação não pode ser desfeita. Todos os dados associados a este usuário serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminPanel;

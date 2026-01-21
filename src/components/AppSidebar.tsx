import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Send,
  MessageSquare,
  Users,
  Bot,
  Settings,
  ScrollText,
  Bell,
  Shield,
  Layers,
  GitBranch,
  LogOut,
  ShieldCheck,
  User,
  BarChart3,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// SDR só tem acesso a: Dashboard, Chat, CRM, Lembretes
const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Prospecção", url: "/", icon: Search, adminOnly: true },
  { title: "Broadcast", url: "/whatsapp/broadcast", icon: Send, adminOnly: true },
  { title: "Chat", url: "/whatsapp/chat", icon: MessageSquare },
  { title: "CRM", url: "/crm", icon: Users },
  { title: "Lembretes", url: "/lembretes", icon: Bell },
  { title: "Equipe", url: "/team-performance", icon: BarChart3, adminOnly: true },
];

// Configurações são apenas para admin
const configItems = [
  { title: "Fases do Funil", url: "/funnel-stages", icon: Layers },
  { title: "Gerenciar Funis", url: "/crm/funnels", icon: GitBranch },
  { title: "Agente IA", url: "/ai-config", icon: Bot },
  { title: "Logs IA", url: "/ai-logs", icon: ScrollText },
  { title: "WhatsApp", url: "/whatsapp/config", icon: Settings },
  { title: "Anti-Bloqueio", url: "/anti-block", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { profile, role, signOut, isAdmin } = useAuth();
  const [handoffCount, setHandoffCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [aiActive, setAiActive] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, []);

  // Centralized realtime subscription
  useRealtimeRefresh('whatsapp_conversations', useCallback(() => {
    loadAlerts();
  }, []));

  const loadAlerts = async () => {
    // Contar handoffs pendentes
    const { count: handoffs } = await supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'handoff');
    
    setHandoffCount(handoffs || 0);

    // Contar lembretes vencidos ou de hoje
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const { count: reminders } = await supabase
      .from('whatsapp_conversations')
      .select('*', { count: 'exact', head: true })
      .not('reminder_at', 'is', null)
      .lte('reminder_at', today.toISOString());
    
    setReminderCount(reminders || 0);

    // Status da IA
    const { data: aiConfig } = await supabase
      .from('whatsapp_ai_config')
      .select('is_active')
      .limit(1)
      .single();
    
    setAiActive(aiConfig?.is_active || false);
  };

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const getRoleBadge = () => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500 hover:bg-red-600 text-xs">Admin</Badge>;
      case 'sdr':
        return <Badge className="bg-blue-500 hover:bg-blue-600 text-xs">SDR</Badge>;
      case 'closer':
        return <Badge className="bg-green-500 hover:bg-green-600 text-xs">Closer</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Sem papel</Badge>;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground">
              Lead Manager
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                // Skip admin-only items for non-admins
                if ('adminOnly' in item && item.adminOnly && !isAdmin) {
                  return null;
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && item.url === "/crm" && handoffCount > 0 && (
                          <Badge variant="destructive" className="ml-auto text-xs">
                            {handoffCount}
                          </Badge>
                        )}
                        {!collapsed && item.url === "/lembretes" && reminderCount > 0 && (
                          <Badge variant="outline" className="ml-auto text-xs border-yellow-500 text-yellow-600">
                            {reminderCount}
                          </Badge>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Configurações para admin e closer (oculto apenas para SDR) */}
        {role !== 'sdr' && (
          <SidebarGroup>
            <SidebarGroupLabel>Configurações</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin")}
                    tooltip="Administração"
                  >
                    <NavLink
                      to="/admin"
                      className="flex items-center gap-2"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {!collapsed && <span>Administração</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {configItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <NavLink
                        to={item.url}
                        className="flex items-center gap-2"
                        activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`h-2 w-2 rounded-full ${
              aiActive ? "bg-green-500" : "bg-muted-foreground"
            }`}
          />
          {!collapsed && (
            <span className="text-muted-foreground">
              IA {aiActive ? "Ativa" : "Inativa"}
            </span>
          )}
        </div>

        {profile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`w-full justify-start gap-2 ${collapsed ? 'px-2' : ''}`}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(profile.full_name)}
                  </AvatarFallback>
                </Avatar>
                {!collapsed && (
                  <div className="flex flex-col items-start text-left flex-1 min-w-0">
                    <span className="text-sm font-medium truncate w-full">
                      {profile.full_name}
                    </span>
                    <div className="mt-0.5">
                      {getRoleBadge()}
                    </div>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{profile.full_name}</span>
                  {getRoleBadge()}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

import { useState, useEffect } from "react";
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
  Dna,
  Layers,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
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

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Prospecção", url: "/", icon: Search },
  { title: "Broadcast", url: "/whatsapp/broadcast", icon: Send },
  { title: "Chat", url: "/whatsapp/chat", icon: MessageSquare },
  { title: "CRM", url: "/crm", icon: Users },
  { title: "Lembretes", url: "/lembretes", icon: Bell },
];

const configItems = [
  { title: "DNAs", url: "/dnas", icon: Dna },
  { title: "Fases do Funil", url: "/funnel-stages", icon: Layers },
  { title: "Agente IA", url: "/ai-config", icon: Bot },
  { title: "Logs IA", url: "/ai-logs", icon: ScrollText },
  { title: "WhatsApp", url: "/whatsapp/config", icon: Settings },
  { title: "Anti-Bloqueio", url: "/anti-block", icon: Shield },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const [handoffCount, setHandoffCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [aiActive, setAiActive] = useState(false);

  useEffect(() => {
    loadAlerts();
    
    // Real-time para handoffs
    const channel = supabase
      .channel('sidebar-alerts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations' },
        () => loadAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
              {menuItems.map((item) => (
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
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
      </SidebarContent>

      <SidebarFooter className="p-4">
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
      </SidebarFooter>
    </Sidebar>
  );
}

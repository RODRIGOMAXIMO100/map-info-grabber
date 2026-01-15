import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import WhatsAppConfig from "./pages/WhatsAppConfig";
import WhatsAppChat from "./pages/WhatsAppChat";
import BroadcastManager from "./pages/BroadcastManager";
import BroadcastDetails from "./pages/BroadcastDetails";
import CRMKanban from "./pages/CRMKanban";
import AIConfig from "./pages/AIConfig";
import AILogs from "./pages/AILogs";
import Dashboard from "./pages/Dashboard";
import Reminders from "./pages/Reminders";
import AntiBlockConfig from "./pages/AntiBlockConfig";
import FunnelStagesManager from "./pages/FunnelStagesManager";
import FunnelManager from "./pages/FunnelManager";
import FunnelStageEditor from "./pages/FunnelStageEditor";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AdminPanel from "./pages/AdminPanel";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            
            {/* Protected routes */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/whatsapp/config" element={<WhatsAppConfig />} />
                      <Route path="/whatsapp/chat" element={<WhatsAppChat />} />
                      <Route path="/whatsapp/broadcast" element={<BroadcastManager />} />
                      <Route path="/whatsapp/broadcast/:id" element={<BroadcastDetails />} />
                      <Route path="/crm" element={<CRMKanban />} />
                      <Route path="/crm/funnels" element={<FunnelManager />} />
                      <Route path="/crm/funnels/:id/edit" element={<FunnelStageEditor />} />
                      <Route path="/lembretes" element={<Reminders />} />
                      <Route path="/ai-config" element={<AIConfig />} />
                      <Route path="/ai-logs" element={<AILogs />} />
                      <Route path="/anti-block" element={<AntiBlockConfig />} />
                      <Route path="/funnel-stages" element={<FunnelStagesManager />} />
                      <Route path="/admin" element={<AdminPanel />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

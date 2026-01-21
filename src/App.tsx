import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

// Lazy load heavy pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CRMKanban = lazy(() => import("./pages/CRMKanban"));
const AILogs = lazy(() => import("./pages/AILogs"));
const WhatsAppChat = lazy(() => import("./pages/WhatsAppChat"));
const WhatsAppConfig = lazy(() => import("./pages/WhatsAppConfig"));
const BroadcastManager = lazy(() => import("./pages/BroadcastManager"));
const BroadcastDetails = lazy(() => import("./pages/BroadcastDetails"));
const AIConfig = lazy(() => import("./pages/AIConfig"));
const Reminders = lazy(() => import("./pages/Reminders"));
const AntiBlockConfig = lazy(() => import("./pages/AntiBlockConfig"));
const FunnelStagesManager = lazy(() => import("./pages/FunnelStagesManager"));
const FunnelManager = lazy(() => import("./pages/FunnelManager"));
const FunnelStageEditor = lazy(() => import("./pages/FunnelStageEditor"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const TeamPerformance = lazy(() => import("./pages/TeamPerformance"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

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
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        {/* Rotas com permissão dinâmica */}
                        <Route path="/dashboard" element={<ProtectedRoute routeKey="dashboard"><Dashboard /></ProtectedRoute>} />
                        <Route path="/whatsapp/chat" element={<ProtectedRoute routeKey="chat"><WhatsAppChat /></ProtectedRoute>} />
                        <Route path="/crm" element={<ProtectedRoute routeKey="crm"><CRMKanban /></ProtectedRoute>} />
                        <Route path="/lembretes" element={<ProtectedRoute routeKey="lembretes"><Reminders /></ProtectedRoute>} />
                        
                        {/* Rotas de configuração com permissão dinâmica */}
                        <Route path="/" element={<ProtectedRoute routeKey="prospeccao"><Index /></ProtectedRoute>} />
                        <Route path="/whatsapp/config" element={<ProtectedRoute routeKey="whatsapp_config"><WhatsAppConfig /></ProtectedRoute>} />
                        <Route path="/whatsapp/broadcast" element={<ProtectedRoute routeKey="broadcast"><BroadcastManager /></ProtectedRoute>} />
                        <Route path="/whatsapp/broadcast/:id" element={<ProtectedRoute routeKey="broadcast"><BroadcastDetails /></ProtectedRoute>} />
                        <Route path="/crm/funnels" element={<ProtectedRoute routeKey="funnel_manager"><FunnelManager /></ProtectedRoute>} />
                        <Route path="/crm/funnels/:id/edit" element={<ProtectedRoute routeKey="funnel_manager"><FunnelStageEditor /></ProtectedRoute>} />
                        <Route path="/ai-config" element={<ProtectedRoute routeKey="ai_config"><AIConfig /></ProtectedRoute>} />
                        <Route path="/ai-logs" element={<ProtectedRoute routeKey="ai_logs"><AILogs /></ProtectedRoute>} />
                        <Route path="/anti-block" element={<ProtectedRoute routeKey="anti_block"><AntiBlockConfig /></ProtectedRoute>} />
                        <Route path="/funnel-stages" element={<ProtectedRoute routeKey="funnel_stages"><FunnelStagesManager /></ProtectedRoute>} />
                        <Route path="/team-performance" element={<ProtectedRoute routeKey="equipe"><TeamPerformance /></ProtectedRoute>} />
                        
                        {/* Admin sempre requer role admin */}
                        <Route path="/admin" element={<ProtectedRoute routeKey="admin"><AdminPanel /></ProtectedRoute>} />
                        
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
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

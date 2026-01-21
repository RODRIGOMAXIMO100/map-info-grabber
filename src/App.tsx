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
                        {/* Rotas públicas para todos os usuários autenticados */}
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/whatsapp/chat" element={<WhatsAppChat />} />
                        <Route path="/crm" element={<CRMKanban />} />
                        <Route path="/lembretes" element={<Reminders />} />
                        
                        {/* Rotas apenas para admin */}
                        <Route path="/" element={<ProtectedRoute requiredRole="admin"><Index /></ProtectedRoute>} />
                        <Route path="/whatsapp/config" element={<ProtectedRoute requiredRole="admin"><WhatsAppConfig /></ProtectedRoute>} />
                        <Route path="/whatsapp/broadcast" element={<ProtectedRoute requiredRole="admin"><BroadcastManager /></ProtectedRoute>} />
                        <Route path="/whatsapp/broadcast/:id" element={<ProtectedRoute requiredRole="admin"><BroadcastDetails /></ProtectedRoute>} />
                        <Route path="/crm/funnels" element={<ProtectedRoute requiredRole="admin"><FunnelManager /></ProtectedRoute>} />
                        <Route path="/crm/funnels/:id/edit" element={<ProtectedRoute requiredRole="admin"><FunnelStageEditor /></ProtectedRoute>} />
                        <Route path="/ai-config" element={<ProtectedRoute requiredRole="admin"><AIConfig /></ProtectedRoute>} />
                        <Route path="/ai-logs" element={<ProtectedRoute requiredRole="admin"><AILogs /></ProtectedRoute>} />
                        <Route path="/anti-block" element={<ProtectedRoute requiredRole="admin"><AntiBlockConfig /></ProtectedRoute>} />
                        <Route path="/funnel-stages" element={<ProtectedRoute requiredRole="admin"><FunnelStagesManager /></ProtectedRoute>} />
                        <Route path="/admin" element={<ProtectedRoute requiredRole="admin"><AdminPanel /></ProtectedRoute>} />
                        <Route path="/team-performance" element={<ProtectedRoute requiredRole="admin"><TeamPerformance /></ProtectedRoute>} />
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

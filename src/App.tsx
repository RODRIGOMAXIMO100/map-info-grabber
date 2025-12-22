import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import WhatsAppConfig from "./pages/WhatsAppConfig";
import WhatsAppChat from "./pages/WhatsAppChat";
import BroadcastManager from "./pages/BroadcastManager";
import CRMKanban from "./pages/CRMKanban";
import AIConfig from "./pages/AIConfig";
import Dashboard from "./pages/Dashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/whatsapp/config" element={<WhatsAppConfig />} />
            <Route path="/whatsapp/chat" element={<WhatsAppChat />} />
            <Route path="/whatsapp/broadcast" element={<BroadcastManager />} />
            <Route path="/crm" element={<CRMKanban />} />
            <Route path="/ai-config" element={<AIConfig />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

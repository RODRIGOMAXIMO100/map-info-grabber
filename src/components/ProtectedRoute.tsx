import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  routeKey?: string;
  requiredRole?: 'admin' | 'sdr' | 'closer';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  routeKey,
  requiredRole 
}) => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const { hasAccess, loading: permLoading } = usePermissions();
  const location = useLocation();

  if (authLoading || permLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admin sempre tem acesso
  if (isAdmin) {
    return <>{children}</>;
  }

  // Verificar permissão dinâmica por routeKey
  if (routeKey && !hasAccess(routeKey)) {
    return <Navigate to="/dashboard" replace />;
  }

  // Legacy: verificar role específico (mantido para compatibilidade)
  if (requiredRole === 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/auth-context';
import { AuthLoadingScreen } from '@/features/auth/components/AuthLoadingScreen';
import { ROUTES } from './navigation';

/** Exige sessão com perfil ativo; senão manda para /login. */
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  return <Outlet />;
}

/** Exige perfil admin; senão manda para /. Use dentro de um ProtectedRoute. */
export function AdminRoute() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (!isAdmin) return <Navigate to={ROUTES.lancar} replace />;
  return <Outlet />;
}

import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { useAuth } from '@/features/auth/auth-context';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { LancamentosPage } from '@/features/lancamentos/LancamentosPage';
import { RelatorioPage } from '@/features/relatorio/RelatorioPage';
import { CategoriasPage } from '@/features/categorias/CategoriasPage';
import { UsuariosPage } from '@/features/admin/UsuariosPage';
import { AppLayout } from './AppLayout';
import { AdminRoute, ProtectedRoute } from './guards';
import { ROUTES } from './navigation';

export function AppRoutes() {
  const { isAdmin } = useAuth();

  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout isAdmin={isAdmin} headerActions={<LogoutButton />} />}>
          <Route index element={<LancamentosPage />} />
          <Route path={ROUTES.relatorio} element={<RelatorioPage />} />
          <Route path={ROUTES.categorias} element={<CategoriasPage />} />
          <Route element={<AdminRoute />}>
            <Route path={ROUTES.usuarios} element={<UsuariosPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.lancar} replace />} />
    </Routes>
  );
}

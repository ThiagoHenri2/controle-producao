import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { useAuth } from '@/features/auth/auth-context';
import { LogoutButton } from '@/features/auth/components/LogoutButton';
import { LancamentosPage } from '@/features/lancamentos/LancamentosPage';
import { RelatorioPage } from '@/features/relatorio/RelatorioPage';
import { CategoriasPage } from '@/features/categorias/CategoriasPage';
import { UsuariosPage } from '@/features/admin/UsuariosPage';
import { EquipePage } from '@/features/equipe/EquipePage';
import { AppLayout } from './AppLayout';
import { AdminRoute, GestorRoute, ProtectedRoute } from './guards';
import { ROUTES } from './navigation';

export function AppRoutes() {
  const { isAdmin, isGestor } = useAuth();

  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route
          element={
            <AppLayout isAdmin={isAdmin} isGestor={isGestor} headerActions={<LogoutButton />} />
          }
        >
          <Route index element={<LancamentosPage />} />
          <Route path={ROUTES.relatorio} element={<RelatorioPage />} />
          <Route path={ROUTES.categorias} element={<CategoriasPage />} />
          <Route element={<GestorRoute />}>
            <Route path={ROUTES.equipe} element={<EquipePage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route path={ROUTES.usuarios} element={<UsuariosPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.lancar} replace />} />
    </Routes>
  );
}

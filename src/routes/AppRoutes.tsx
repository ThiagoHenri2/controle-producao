import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { LancamentosPage } from '@/features/lancamentos/LancamentosPage';
import { RelatorioPage } from '@/features/relatorio/RelatorioPage';
import { CategoriasPage } from '@/features/categorias/CategoriasPage';
import { UsuariosPage } from '@/features/admin/UsuariosPage';
import { AppLayout } from './AppLayout';
import { ROUTES } from './navigation';

/**
 * Rotas do app. Ainda sem guards: a spec 002 envolve o layout com
 * `ProtectedRoute`, a rota de usuários com `AdminRoute` e passa
 * `isAdmin`/`headerActions` (botão "Sair") para o `AppLayout`.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      {/* TODO(spec 002): isAdmin vem do perfil do usuário logado. */}
      <Route element={<AppLayout isAdmin />}>
        <Route index element={<LancamentosPage />} />
        <Route path={ROUTES.relatorio} element={<RelatorioPage />} />
        <Route path={ROUTES.categorias} element={<CategoriasPage />} />
        <Route path={ROUTES.usuarios} element={<UsuariosPage />} />
      </Route>
      <Route path="*" element={<Navigate to={ROUTES.lancar} replace />} />
    </Routes>
  );
}

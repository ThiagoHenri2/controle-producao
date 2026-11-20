import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui';
import { AppLayout } from './AppLayout';

function renderAt(path: string, isAdmin = true) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<AppLayout isAdmin={isAdmin} />}>
            <Route index element={<p>pagina-lancar</p>} />
            <Route path="/relatorio" element={<p>pagina-relatorio</p>} />
            <Route path="/categorias" element={<p>pagina-categorias</p>} />
            <Route path="/admin/usuarios" element={<p>pagina-usuarios</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe('AppLayout + BottomNav', () => {
  it('navega entre as rotas e destaca a ativa', async () => {
    const user = userEvent.setup();
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lançar');
    expect(screen.getByRole('link', { name: 'Lançar' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('link', { name: 'Relatório' }));
    expect(screen.getByText('pagina-relatorio')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Relatório');
    expect(screen.getByRole('link', { name: 'Lançar' })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('link', { name: 'Categorias' }));
    expect(screen.getByText('pagina-categorias')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Usuários' }));
    expect(screen.getByText('pagina-usuarios')).toBeInTheDocument();
    expect(nav).toBeInTheDocument();
  });

  it('esconde "Usuários" para quem não é admin', () => {
    renderAt('/', false);
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument();
  });
});
